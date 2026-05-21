import { NextRequest, NextResponse } from 'next/server';

// ─── Duration-aware topic count recommendation ───
function getRecommendedTopicCount(minutes: number): string {
  if (minutes <= 10) return '2-3';
  if (minutes <= 20) return '3-4';
  if (minutes <= 35) return '4-6';
  if (minutes <= 50) return '5-7';
  if (minutes <= 75) return '6-8';
  return '7-10';
}

function getDepthGuidance(minutes: number): string {
  if (minutes <= 10) return 'Focus ONLY on the 2-3 most essential skills. Each topic should be highly specific and directly job-critical.';
  if (minutes <= 20) return 'Focus on core competencies. Keep topics targeted and avoid overlap.';
  if (minutes <= 35) return 'Balance breadth and depth. Include both technical and soft skills most relevant to the role.';
  if (minutes <= 50) return 'Cover a comprehensive range of skills. Include technical depth, soft skills, and role-specific scenarios.';
  if (minutes <= 75) return 'Provide thorough coverage. Include advanced technical topics, behavioral assessment, leadership indicators, and cultural fit.';
  return 'Maximum depth and breadth. Cover advanced technical mastery, complex problem-solving, leadership, cultural alignment, growth potential, and specialized domain knowledge.';
}

export async function POST(req: NextRequest) {
  try {
    const { jobTitle, description, jobType, language, customTopics, singleCriterion, interviewDuration } = await req.json();

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
      const durationMinutes = typeof interviewDuration === 'number' && interviewDuration > 0 ? interviewDuration : 30;
      
      systemPrompt = `You are an expert HR consultant. A recruiter has defined custom interview topics for the role "${jobTitle}". 
Your job is to ENRICH each topic with evaluation criteria and an importance weight.

INTERVIEW DURATION: ${durationMinutes} minutes (${customTopics.length} topics means ~${Math.round((durationMinutes * 0.8) / customTopics.length)} min per topic)

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
      const durationMinutes = typeof interviewDuration === 'number' && interviewDuration > 0 ? interviewDuration : 30;
      const recommendedCount = getRecommendedTopicCount(durationMinutes);
      const depthGuidance = getDepthGuidance(durationMinutes);

      systemPrompt = `You are an expert HR consultant who works with companies across ALL industries — tech, healthcare, education, retail, manufacturing, finance, hospitality, media, and more.

Given a job posting and interview duration, generate interview topics that are HIGHLY SPECIFIC to this role and industry. Each topic must include evaluation criteria.

INTERVIEW DURATION: ${durationMinutes} minutes
RECOMMENDED TOPIC COUNT: ${recommendedCount} topics
DEPTH GUIDANCE: ${depthGuidance}

For each topic, return an object with:
- "label": concise topic name (3-6 words)
- "rubric": an object with:
  - "excellent": 1 sentence — what a top candidate (9-10) demonstrates for this topic
  - "acceptable": 1 sentence — what an adequate candidate (6-8) demonstrates
  - "poor": 1 sentence — what a weak candidate (0-5) demonstrates
  - "weight": importance 1-10 for THIS specific role

RULES:
- Generate EXACTLY ${recommendedCount} topics (adjust to fit the ${durationMinutes}-minute interview duration)
- Mix technical/hard skills AND soft skills appropriate to the role
- Topics must be DIRECTLY relevant to the job description, not generic
- Weights should vary — not all 5s. The most critical skill for the role should be 8-10, nice-to-haves 2-4
- For short interviews (≤15 min): only include absolutely essential, high-weight topics
- For long interviews (≥60 min): include deeper, more nuanced topics that allow thorough assessment
- If no description is provided, infer from the job title and type

Return ONLY a JSON array of objects. No markdown formatting, no explanation.
CRITICAL: All text values MUST be in ${lang}.`;

      userMessage = `Generate interview rubric topics for this role:

TITLE: "${jobTitle}"
TYPE: ${jobType || 'Not specified'}
DURATION: ${durationMinutes} minutes
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
        model: 'deepseek/deepseek-v4-flash',
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

    // Bug 26 fix: when `response_format` is `json_object`, OpenAI/OpenRouter
    // guarantees a JSON OBJECT, not a bare array. Different models wrap the
    // array under different keys ("topics", "criteria", "items", etc.). We
    // try several shapes before giving up.
    let topics: unknown = null;
    try {
      const arrayMatch = content.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        // Some models still return a bare array despite `json_object` — accept it.
        topics = JSON.parse(arrayMatch[0]);
      } else {
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          const obj = JSON.parse(objMatch[0]);
          // Try common wrapper keys
          const candidate = obj.topics ?? obj.criteria ?? obj.items ?? obj.rubric ?? obj.data ?? null;
          if (Array.isArray(candidate)) {
            topics = candidate;
          } else if (Array.isArray(obj)) {
            topics = obj;
          } else {
            // Last resort: find the first array-valued property
            const firstArray = Object.values(obj).find((v) => Array.isArray(v));
            if (Array.isArray(firstArray)) topics = firstArray;
          }
        }
      }
    } catch {
      // fall through to error response below
    }

    if (!Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json(
        { error: 'Failed to parse topics JSON', raw: content.substring(0, 300) },
        { status: 500 }
      );
    }
    return NextResponse.json({ topics });
  } catch (error) {
    console.error('Generate rubric API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
