import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documents, programTitle, companyName, existingModules } = body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json(
        { error: 'No documents provided' },
        { status: 400 }
      );
    }

    if (!programTitle || !companyName) {
      return NextResponse.json(
        { error: 'Missing required fields: programTitle, companyName' },
        { status: 400 }
      );
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }

    // Build document context for the AI
    const documentContext = documents
      .map(
        (doc: { fileName: string; extractedText?: string; aiTopics?: unknown }) =>
          `--- DOCUMENT: ${doc.fileName} ---\n${doc.extractedText || ''}\n${doc.aiTopics ? `\nAI-EXTRACTED TOPICS:\n${JSON.stringify(doc.aiTopics, null, 2)}` : ''}`
      )
      .join('\n\n');

    const existingModulesContext = existingModules && existingModules.length > 0
      ? `\nEXISTING MODULES (do not duplicate, build upon these):\n${JSON.stringify(existingModules.map((m: { title: string; description: string }) => ({ title: m.title, description: m.description })), null, 2)}`
      : '';

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify Training Center',
      },
      body: JSON.stringify({
        model: 'x-ai/grok-4.20',
        messages: [
          {
            role: 'system',
            content: `You are an expert corporate training designer. Given company documents, create a structured training program with modules ordered from foundational to advanced. Each module should build on the previous one.

RULES:
- Create clear, actionable training modules based on the document content
- Order modules from basic/foundational concepts to advanced/specialized topics
- Each module should be self-contained but build naturally on previous ones
- Include practical evaluation questions that test real understanding, not just memorization
- Duration estimates should be realistic (most modules 20-45 minutes)
- Content should be detailed enough for an AI tutor to teach from
- Write in the same language as the source documents (if Spanish, write in Spanish)
- Each section body should be comprehensive (at least 3-4 paragraphs of teaching content)

Respond ONLY with valid JSON.`,
          },
          {
            role: 'user',
            content: `Create a structured training program titled "${programTitle}" for ${companyName}.

COMPANY DOCUMENTS:
${documentContext}
${existingModulesContext}

Return JSON with this structure:
{
  "modules": [
    {
      "title": "Module title",
      "description": "Brief description of what this module covers",
      "content": {
        "sections": [
          {
            "title": "Section title",
            "body": "Detailed section content for teaching (3-4 paragraphs minimum). Include explanations, examples, and practical guidance.",
            "keyPoints": ["Key takeaway 1", "Key takeaway 2", "Key takeaway 3"]
          }
        ]
      },
      "durationEstimate": "Estimated completion time (e.g. '30 minutes')",
      "evaluationQuestions": [
        {
          "question": "The question text",
          "type": "multiple_choice | open_ended | true_false",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "The correct answer",
          "explanation": "Why this is the correct answer"
        }
      ]
    }
  ]
}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[generate-modules] AI API error:', errorText);
      return NextResponse.json(
        { error: 'AI service unavailable. Please try again.' },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let generated;
    try {
      generated = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[generate-modules] JSON parse error:', jsonStr.substring(0, 500));
      return NextResponse.json(
        { error: 'Failed to parse AI response. Please try again.' },
        { status: 500 }
      );
    }

    // Validate structure
    if (!generated.modules || !Array.isArray(generated.modules)) {
      return NextResponse.json(
        { error: 'AI returned invalid module structure. Please try again.' },
        { status: 500 }
      );
    }

    // Ensure each module has required fields with defaults
    const modules = generated.modules.map((mod: Record<string, unknown>, index: number) => ({
      title: mod.title || `Module ${index + 1}`,
      description: mod.description || '',
      content: mod.content || { sections: [] },
      durationEstimate: mod.durationEstimate || '30 minutes',
      evaluationQuestions: Array.isArray(mod.evaluationQuestions)
        ? mod.evaluationQuestions
        : [],
      orderIndex: index,
    }));

    return NextResponse.json({
      success: true,
      programTitle,
      companyName,
      modules,
      totalModules: modules.length,
    });
  } catch (error) {
    const err = error as Error;
    console.error('[generate-modules] failure:', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
