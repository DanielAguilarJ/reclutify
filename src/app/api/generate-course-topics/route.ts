import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { name, description, objectives, benefits, modules, plans, targetAudience } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Course name is required' },
        { status: 400 }
      );
    }

    // Build structured course info for the AI
    const modulesList = (modules || [])
      .map((m: { title: string; description?: string; orderIndex: number }, i: number) =>
        `  ${i + 1}. ${m.title}${m.description ? `: ${m.description}` : ''}`
      ).join('\n') || '  (no modules defined yet)';

    const plansList = (plans || [])
      .map((p: { name: string; price: number; currency: string; features?: string[] }) =>
        `  - ${p.name}: $${p.price} ${p.currency}${p.features?.length ? ` (${p.features.join(', ')})` : ''}`
      ).join('\n') || '  (no plans defined yet)';

    const objectivesList = (objectives || []).map((o: string) => `  - ${o}`).join('\n') || '  (none)';
    const benefitsList = (benefits || []).map((b: string) => `  - ${b}`).join('\n') || '  (none)';

    const systemPrompt = `You are an expert sales conversation designer for coaching programs and online courses.
Your job is to generate a structured set of conversational TOPICS (phases) for a virtual sales session where an AI "Coach Virtual" will inform and sell a course to a potential client.

Each topic represents a PHASE of the sales conversation, with specific talking points the AI should cover.

RULES:
1. Generate exactly 5-6 topics covering the full sales conversation arc
2. Each topic must have 3-6 specific talking points
3. Topics must flow naturally in a sales conversation sequence
4. Talking points should be actionable phrases/sentences the AI can use or adapt
5. Include emotional triggers, benefit-focused language, and urgency elements
6. The "duration" field is an estimated number of minutes for that phase
7. Return ONLY valid JSON, no markdown or extra text

REQUIRED TOPIC STRUCTURE (adapt labels to be specific to this course):
1. Opening & Discovery - greet, learn about the client's needs/pain points
2. Program Presentation - introduce what the course is and its philosophy
3. Modules & Content - detailed breakdown of what they'll learn
4. Results & Benefits - outcomes, transformations, testimonials
5. Investment & Plans - pricing, plan options, value proposition
6. Closing & Call to Action - urgency, next steps, commitment

OUTPUT FORMAT:
{
  "topics": [
    {
      "id": "<uuid>",
      "label": "<topic name in Spanish>",
      "talkingPoints": ["<point 1>", "<point 2>", ...],
      "order": <number starting at 1>,
      "duration": <estimated minutes>
    }
  ]
}`;

    const userPrompt = `Generate conversational topics for the following course/program:

COURSE NAME: ${name}
DESCRIPTION: ${description || 'Not provided'}
TARGET AUDIENCE: ${targetAudience || 'General'}

OBJECTIVES:
${objectivesList}

BENEFITS:
${benefitsList}

MODULES:
${modulesList}

PLANS/PRICING:
${plansList}

Generate 5-6 sales conversation topics with specific talking points in Spanish. Make them persuasive and focused on converting the client.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify Coach Platform',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter error (generate-course-topics):', errorText);
      return NextResponse.json(
        { error: 'Failed to generate topics from AI' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in AI response:', content);
      return NextResponse.json(
        { error: 'AI response did not contain valid JSON' },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.topics || !Array.isArray(parsed.topics)) {
      return NextResponse.json(
        { error: 'AI response missing topics array' },
        { status: 500 }
      );
    }

    // Validate and normalize topic structure
    const topics = parsed.topics.map((topic: {
      id?: string;
      label?: string;
      talkingPoints?: string[];
      order?: number;
      duration?: number;
    }, index: number) => ({
      id: topic.id || crypto.randomUUID(),
      label: topic.label || `Tema ${index + 1}`,
      talkingPoints: Array.isArray(topic.talkingPoints) ? topic.talkingPoints : [],
      order: topic.order || index + 1,
      duration: typeof topic.duration === 'number' ? topic.duration : 3,
    }));

    return NextResponse.json({ topics });
  } catch (error) {
    console.error('generate-course-topics error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
