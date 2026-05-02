import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { jobTitle, description, jobType, language, customTopics, singleCriterion } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    const lang = language === 'es' ? 'Spanish (Español)' : 'English';

    let systemPrompt: string;
    let userMessage: string;

    if (singleCriterion && singleCriterion.name) {
      // Mode: SINGLE CRITERION — generate rubric for one specific criterion
      systemPrompt = `You are an expert HR consultant. Generate evaluation criteria for ONE specific interview topic.

Return a JSON object with:
- "label": "${singleCriterion.name}" (keep as-is)
- "rubric": {
  - "excellent": 1 sentence describing what a top-performing candidate (9-10 score) demonstrates
  - "acceptable": 1 sentence describing what an adequate candidate (6-8 score) demonstrates
  - "poor": 1 sentence describing what a weak candidate (0-5 score) demonstrates
  - "weight": ${singleCriterion.weight || 5}
}

JOB CONTEXT:
- Title: ${jobTitle || 'Not specified'}
- Type: ${jobType || 'Not specified'}
- Description: ${description || 'Not provided'}

Return ONLY the JSON object. No markdown, no explanation.
CRITICAL: All text values MUST be in ${lang}.`;

      userMessage = `Generate evaluation rubric for this criterion: "${singleCriterion.name}" (weight: ${singleCriterion.weight || 5}/10)`;
    } else if (customTopics && customTopics.length > 0) {
      // Mode: ENRICH existing topics defined by the admin
      systemPrompt = `You are an expert HR consultant. A recruiter has defined custom interview topics for the role "${jobTitle}". 
Your job is to ENRICH each topic with evaluation criteria and an importance weight.

For each topic provided, generate:
- "label": keep the original label as-is
- "rubric": an object with:
  - "excellent": 1 sentence describing what a top-performing candidate (9-10 score) demonstrates
  - "acceptable": 1 sentence describing what an adequate candidate (6-8 score) demonstrates
  - "poor": 1 sentence describing what a weak candidate (0-5 score) demonstrates
  - "weight": importance from 1-10 based on how critical this topic is for the specific role

JOB CONTEXT:
- Title: ${jobTitle}
- Type: ${jobType || 'Full Time'}
- Description: ${description || 'Not provided'}

Return ONLY a JSON array of objects. No markdown, no explanation.
CRITICAL: All text values MUST be in ${lang}.`;

      userMessage = `Enrich these interview topics with evaluation criteria:\n${customTopics.map((t: { label: string; weight?: number }, i: number) => `${i + 1}. "${t.label}"${t.weight ? ` (suggested weight: ${t.weight}/10)` : ''}`).join('\n')}`;
    } else {
      // Mode: GENERATE topics from scratch using job context
      systemPrompt = `You are an expert HR consultant who works with companies across ALL industries — tech, healthcare, education, retail, manufacturing, finance, hospitality, media, and more.

Given a job posting, generate 5-7 interview topics that are HIGHLY SPECIFIC to this role and industry. Each topic must include evaluation criteria.

For each topic, return an object with:
- "label": concise topic name (3-6 words)
- "rubric": an object with:
  - "excellent": 1 sentence — what a top candidate (9-10) demonstrates for this topic
  - "acceptable": 1 sentence — what an adequate candidate (6-8) demonstrates
  - "poor": 1 sentence — what a weak candidate (0-5) demonstrates
  - "weight": importance 1-10 for THIS specific role

RULES:
- Mix technical/hard skills AND soft skills appropriate to the role
- Topics must be DIRECTLY relevant to the job description, not generic
- Weights should vary — not all 5s. The most critical skill for the role should be 8-10, nice-to-haves 2-4
- If no description is provided, infer from the job title and type

Return ONLY a JSON array of objects. No markdown formatting, no explanation.
CRITICAL: All text values MUST be in ${lang}.`;

      userMessage = `Generate interview rubric topics for this role:

TITLE: "${jobTitle}"
TYPE: ${jobType || 'Not specified'}
DESCRIPTION: ${description || 'Not provided — infer from the title'}`;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify AI Interviewer',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter rubric error:', errorData);
      return NextResponse.json(
        { error: 'Failed to generate rubric' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Single criterion mode returns a single object, not an array
    if (singleCriterion && singleCriterion.name) {
      const jsonObjMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonObjMatch) {
        return NextResponse.json(
          { error: 'Failed to parse single criterion JSON' },
          { status: 500 }
        );
      }
      const criterion = JSON.parse(jsonObjMatch[0]);
      return NextResponse.json({ criterion });
    }

    // Parse the JSON array from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Failed to parse topics JSON' },
        { status: 500 }
      );
    }

    const topics = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('Generate rubric API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
