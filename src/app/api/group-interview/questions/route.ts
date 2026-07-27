import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

interface RoleTopic {
  label: string;
  rubric?: {
    excellent?: string;
    acceptable?: string;
    poor?: string;
    weight?: number;
  } | null;
}

interface GeneratedQuestion {
  topic: string;
  question: string;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);

    const roleId =
      typeof body?.roleId === "string"
        ? body.roleId.trim()
        : "";

    const language =
      body?.language === "en" ? "en" : "es";

    if (!roleId || roleId.length > 200) {
      return NextResponse.json(
        { error: "Invalid role id" },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } =
      await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (
      profileError ||
      !profile?.org_id
    ) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 403 },
      );
    }

    const { data: role, error: roleError } =
      await supabase
        .from("roles")
        .select(
          "id, title, description, job_type, location, interview_duration, topics",
        )
        .eq("id", roleId)
        .eq("org_id", profile.org_id)
        .maybeSingle();

    if (roleError || !role) {
      return NextResponse.json(
        { error: "Role not found" },
        { status: 404 },
      );
    }

    const rawTopics = Array.isArray(role.topics)
      ? role.topics
      : [];

    const topics: RoleTopic[] = rawTopics
      .filter(
        (topic: unknown): topic is RoleTopic =>
          typeof topic === "object" &&
          topic !== null &&
          typeof (topic as RoleTopic).label ===
            "string" &&
          (topic as RoleTopic).label.trim().length >
            0,
      )
      .slice(0, 15)
      .map((topic) => ({
        label: topic.label.trim().slice(0, 300),
        rubric:
          topic.rubric &&
          typeof topic.rubric === "object"
            ? topic.rubric
            : null,
      }));

    if (topics.length === 0) {
      return NextResponse.json(
        {
          error:
            "The role does not have interview topics",
        },
        { status: 400 },
      );
    }

    const apiKey =
      process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OpenRouter API key not configured",
        },
        { status: 500 },
      );
    }

    const languageName =
      language === "es"
        ? "Spanish (Español)"
        : "English";

    const topicContext = topics
      .map((topic, index) => {
        const rubric = topic.rubric;

        return [
          `${index + 1}. ${topic.label}`,
          rubric?.excellent
            ? `Excellent evidence: ${rubric.excellent}`
            : "",
          rubric?.acceptable
            ? `Acceptable evidence: ${rubric.acceptable}`
            : "",
          rubric?.poor
            ? `Poor evidence: ${rubric.poor}`
            : "",
          `Weight: ${rubric?.weight ?? 5}/10`,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    const systemPrompt = `
You are Zara, a professional interview facilitator.

You are preparing a supervised, in-person GROUP interview.

Several candidates are physically present in the same room.
They will receive the same question at the same time.
Each person will write their answer privately on paper.
A human moderator will click a button when everyone has finished.
You will NOT receive, read, analyze or evaluate their answers.

Generate exactly ONE written interview question for EACH topic provided.

STRICT RULES:
- Return the questions in exactly the same order as the topics.
- Generate exactly ${topics.length} questions.
- Each question must evaluate the corresponding topic.
- Each question must stand on its own.
- Each question must contain exactly one interrogative clause.
- Do not include follow-up questions.
- Do not request spoken answers.
- Do not mention microphones, cameras, video, recording, screens or AI.
- Do not ask candidates to use a computer.
- The candidates will answer on paper.
- Keep each question under 40 words.
- Questions must be fair for all people in the room.
- Do not reference a specific candidate, CV, employer or previous answer.
- Do not include greetings, explanations, transitions or closing messages.
- Respond only in ${languageName}.

Return valid JSON with this exact structure:
{
  "questions": [
    {
      "question": "Question text"
    }
  ]
}
`.trim();

    const userPrompt = `
ROLE:
${role.title}

DESCRIPTION:
${role.description || "Not provided"}

JOB TYPE:
${role.job_type || "Not provided"}

LOCATION:
${role.location || "Not provided"}

INTERVIEW TOPICS AND RUBRICS:
${topicContext}
`.trim();

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      25000,
    );

    let response: Response;

    try {
      response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer":
              "https://reclutify.com",
            "X-Title":
              "Reclutify Group Interview Guide",
          },
          body: JSON.stringify({
            model:
              "google/gemini-3.6-flash",
            messages: [
              {
                role: "system",
                content: systemPrompt,
              },
              {
                role: "user",
                content: userPrompt,
              },
            ],
            response_format: {
              type: "json_object",
            },
            temperature: 0.4,
            max_tokens: 1600,
          }),
          signal: controller.signal,
        },
      );
    } catch (error) {
      const aborted =
        error instanceof Error &&
        error.name === "AbortError";

      return NextResponse.json(
        {
          error: aborted
            ? "Question generation timed out"
            : "Question generation failed",
        },
        { status: aborted ? 504 : 502 },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const upstreamError =
        await response.text();

      console.error(
        "[group-interview] OpenRouter error:",
        upstreamError,
      );

      return NextResponse.json(
        {
          error:
            "Failed to generate interview questions",
        },
        { status: 502 },
      );
    }

    const completion = await response.json();

    const content =
      completion.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return NextResponse.json(
        {
          error:
            "AI response did not contain content",
        },
        { status: 502 },
      );
    }

    let parsed: unknown;

    try {
      const objectMatch =
        content.match(/\{[\s\S]*\}/);

      parsed = JSON.parse(
        objectMatch?.[0] || content,
      );
    } catch {
      return NextResponse.json(
        {
          error:
            "AI response was not valid JSON",
        },
        { status: 502 },
      );
    }

    const generated =
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray(
        (
          parsed as {
            questions?: unknown;
          }
        ).questions,
      )
        ? (
            parsed as {
              questions: unknown[];
            }
          ).questions
        : [];

    if (
      generated.length !== topics.length
    ) {
      return NextResponse.json(
        {
          error:
            "AI returned an unexpected number of questions",
        },
        { status: 502 },
      );
    }

    const questions: GeneratedQuestion[] =
      generated.map((item, index) => {
        const question =
          typeof item === "object" &&
          item !== null &&
          typeof (
            item as {
              question?: unknown;
            }
          ).question === "string"
            ? (
                item as {
                  question: string;
                }
              ).question.trim()
            : "";

        return {
          topic: topics[index].label,
          question,
        };
      });

    if (
      questions.some(
        (item) =>
          !item.question ||
          item.question.length > 1000,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "AI returned an invalid question",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      roleId: role.id,
      roleTitle: role.title,
      interviewDuration:
        role.interview_duration ?? 30,
      questions,
    });
  } catch (error) {
    console.error(
      "[group-interview] Unexpected error:",
      error,
    );

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
