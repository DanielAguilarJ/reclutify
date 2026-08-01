import { NextRequest, NextResponse } from 'next/server';

import { CONTENT_GENERATION_MODEL } from '@/lib/ai-model';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { chatCompletion } from '@/lib/api/openrouter';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { groupInterviewRequestSchema } from '@/lib/schemas/api';
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
    // Esta ruta YA comprobaba sesión y pertenencia a la organización: es el
    // patrón correcto que el resto de los endpoints de IA no seguía. Lo que le
    // faltaba era validación de entrada y tope de tasa.
    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const { roleId, language, questionCount } = groupInterviewRequestSchema.parse(rawBody);

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

    // Después de autorizar: la cuota se consume por organización, no por IP.
    await enforceRateLimit(req, RATE_LIMITS.AI_GENERATE, role.org_id);

    // ─── Build the AI prompt ───
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

    const completion = await chatCompletion({
      model: CONTENT_GENERATION_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.6,
      jsonMode: true,
      timeoutMs: 45_000,
      title: 'Reclutify Group Interview',
      signal: req.signal,
    });

    const parsed = completion.parseJson<{ questions?: unknown } | unknown[]>();

    const questions = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { questions?: unknown })?.questions)
        ? ((parsed as { questions: unknown[] }).questions)
        : [];

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'No questions generated' }, { status: 500 });
    }

    return NextResponse.json({
      questions,
      roleTitle: role.title,
    });
  } catch (error) {
    return handleApiError(error, '[group-interview]');
  }
}
