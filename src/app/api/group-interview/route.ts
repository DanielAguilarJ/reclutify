import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * POST /api/group-interview
 * 
 * Generates a list of interview questions for a group in-person session.
 * This is the ONLY AI call for the entire session.
 * 
 * Body: { roleId: string, language: 'en' | 'es', questionCount?: number }
 * Returns: { questions: string[], roleTitle: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { roleId, language = 'es', questionCount = 10 } = await req.json();

    if (!roleId) {
      return NextResponse.json({ error: 'roleId is required' }, { status: 400 });
    }

    // ─── Auth check ───
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ─── Fetch the role with topics ───
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, title, description, topics, org_id')
      .eq('id', roleId)
      .single();

    if (roleError || !role) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // ─── Verify user belongs to this org ───
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!profile || profile.org_id !== role.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ─── Build the AI prompt ───
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'AI API key not configured' }, { status: 500 });
    }

    const lang = language === 'es' ? 'Spanish (Espanol)' : 'English';
    const topics = Array.isArray(role.topics) ? role.topics : [];
    const topicsDescription = topics.length > 0
      ? topics.map((t: { label: string; rubric?: { excellent?: string; weight?: number } }, i: number) => {
          let line = `${i + 1}. ${t.label}`;
          if (t.rubric?.weight) line += ` (weight: ${t.rubric.weight}/10)`;
          if (t.rubric?.excellent) line += ` — Excellent: ${t.rubric.excellent}`;
          return line;
        }).join('\n')
      : 'No specific topics defined.';

    const clampedCount = Math.max(5, Math.min(20, questionCount));

    const systemPrompt = `You are Zara, an expert AI interviewer assistant. You are helping a moderator conduct a GROUP in-person interview session.

Your task: Generate exactly ${clampedCount} interview questions that the moderator will display one-by-one to a room full of candidates who will write their answers on paper.

RULES:
- Generate exactly ${clampedCount} questions, numbered.
- Questions must be CLEAR and CONCISE — candidates will write answers by hand.
- Questions should cover the topics and rubrics provided, distributed evenly.
- Start with easier/introductory questions and increase difficulty progressively.
- Each question must be self-contained (no follow-ups that depend on previous answers).
- Do NOT ask questions that require showing code, diagrams, or digital tools.
- Questions should be answerable in writing in 3-5 minutes each.
- ALL questions must be in ${lang}.

Return ONLY a JSON object with this structure:
{
  "questions": ["Question 1 text", "Question 2 text", ...]
}

No markdown, no explanation, just the JSON.`;

    const userMessage = `Generate ${clampedCount} group interview questions for this role:

ROLE: "${role.title}"
DESCRIPTION: ${role.description || 'Not provided — infer from the title'}

EVALUATION TOPICS AND RUBRICS:
${topicsDescription}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify Group Interview',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter group-interview error:', errorText);
      return NextResponse.json({ error: 'Failed to generate questions' }, { status: 500 });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    let questions: string[] = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.questions)) {
        questions = parsed.questions;
      } else if (Array.isArray(parsed)) {
        questions = parsed;
      } else {
        // Try to find an array in the response
        const arrMatch = content.match(/\[[\s\S]*\]/);
        if (arrMatch) {
          questions = JSON.parse(arrMatch[0]);
        }
      }
    } catch {
      // Try regex fallback
      const arrMatch = content.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          questions = JSON.parse(arrMatch[0]);
        } catch {
          return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
        }
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'No questions generated' }, { status: 500 });
    }

    return NextResponse.json({
      questions,
      roleTitle: role.title,
    });
  } catch (error) {
    console.error('Group interview API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
