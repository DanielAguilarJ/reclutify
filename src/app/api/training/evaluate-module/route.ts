import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  evaluateTrainingModuleSchema,
  openEndedGradingSchema,
} from '@/lib/training/contracts';

export const runtime = 'nodejs';
export const maxDuration = 60;

type EvaluationQuestion = {
  question: string;
  type: 'multiple_choice' | 'open_ended' | 'true_false';
  options?: string[];
  correctAnswer: string;
  explanation?: string;
};

export async function POST(req: NextRequest) {
  try {
    // 1. Validar sesión del empleado
    const employee = await getTrainingEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized training session' }, { status: 401 });
    }

    const parsed = evaluateTrainingModuleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { moduleId, answers: rawAnswers } = parsed.data;

    const admin = createAdminClient();

    // 2. Cargar el módulo asignado
    const { data: moduleData, error: modError } = await admin
      .from('training_modules')
      .select('id, evaluation_enabled, evaluation_questions, program_id')
      .eq('id', moduleId)
      .eq('program_id', employee.program_id)
      .maybeSingle();

    if (modError || !moduleData) {
      console.error('[Evaluate API] Module load error:', modError);
      return NextResponse.json({ error: 'Assigned module not found' }, { status: 404 });
    }

    // 3. Guard: evaluación habilitada
    if (!(moduleData.evaluation_enabled as boolean)) {
      return NextResponse.json(
        { error: 'This module does not have an evaluation' },
        { status: 409 }
      );
    }

    const questions = (moduleData.evaluation_questions ?? []) as EvaluationQuestion[];
    if (questions.length === 0) {
      return NextResponse.json({ error: 'This module has no evaluation questions' }, { status: 400 });
    }

    // 4. Validar índices
    const submittedIndexes = rawAnswers.map((a) => a.questionIndex);
    const uniqueIndexes = new Set(submittedIndexes);

    if (uniqueIndexes.size !== submittedIndexes.length) {
      return NextResponse.json(
        { error: 'Duplicate question indexes are not allowed' },
        { status: 400 }
      );
    }

    if (submittedIndexes.some((idx) => idx < 0 || idx >= questions.length)) {
      return NextResponse.json(
        { error: 'Answer references an unknown question' },
        { status: 400 }
      );
    }

    const expectedIndexes = questions.map((_, i) => i);
    if (
      submittedIndexes.length !== expectedIndexes.length ||
      expectedIndexes.some((idx) => !uniqueIndexes.has(idx))
    ) {
      return NextResponse.json(
        { error: 'All evaluation questions must be answered' },
        { status: 400 }
      );
    }

    // Construir mapa índice -> respuesta (ya validado que existen todos)
    const answers: Record<number, string> = {};
    for (const item of rawAnswers) {
      answers[item.questionIndex] = item.answer;
    }

    // 5. Calificar respuestas
    const deterministicResults: { index: number; correct: boolean; explanation?: string }[] = [];
    const openEndedToEvaluate: {
      index: number;
      question: string;
      answerExpected: string;
      answerGiven: string;
    }[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answerGiven = answers[i]; // ya validado que existe

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        const expected = String(q.correctAnswer ?? '').trim().toLowerCase();
        const given = String(answerGiven).trim().toLowerCase();
        deterministicResults.push({
          index: i,
          correct: expected === given,
          explanation: q.explanation ?? '',
        });
      } else if (q.type === 'open_ended') {
        openEndedToEvaluate.push({
          index: i,
          question: q.question,
          answerExpected: q.correctAnswer ?? '',
          answerGiven: String(answerGiven),
        });
      }
    }

    const openEndedResults: { index: number; correct: boolean; explanation: string }[] = [];

    if (openEndedToEvaluate.length > 0) {
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL ?? 'google/gemini-2.5-flash';

      if (!OPENROUTER_API_KEY) {
        return NextResponse.json(
          { error: 'AI service not configured for grading open questions' },
          { status: 503 }
        );
      }

      const aiPrompt = `You are a strict grading assistant. Evaluate the user's answers against the expected correct answers for these open-ended questions.
Determine if they are conceptually correct (correct: true/false) and provide a short 1-sentence explanation of why.

QUESTIONS TO EVALUATE:
${JSON.stringify(openEndedToEvaluate, null, 2)}

Return JSON:
{
  "evaluations": [
    {
      "index": 0,
      "correct": true,
      "explanation": "Explanation here..."
    }
  ]
}
Respond ONLY with valid JSON.`;

      const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://reclutify.com',
          'X-Title': 'Reclutify Training Center',
        },
        body: JSON.stringify({
          model: TRAINING_AI_MODEL,
          messages: [{ role: 'user', content: aiPrompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResponse.ok) {
        console.error('[Evaluate API] AI grading service returned error');
        return NextResponse.json({ error: 'AI grading service is unavailable' }, { status: 502 });
      }

      const aiData = (await aiResponse.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = aiData.choices?.[0]?.message?.content ?? '{}';
      const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();

      let rawGrading: unknown;
      try {
        rawGrading = JSON.parse(cleanContent);
      } catch {
        console.error('[Evaluate API] Failed to parse grading JSON:', cleanContent.substring(0, 500));
        return NextResponse.json({ error: 'AI grading service is unavailable' }, { status: 502 });
      }

      const gradingResult = openEndedGradingSchema.safeParse(rawGrading);
      if (!gradingResult.success) {
        console.error('[Evaluate API] AI grading failed Zod validation:', gradingResult.error.flatten());
        return NextResponse.json({ error: 'AI grading service is unavailable' }, { status: 502 });
      }

      for (const grading of gradingResult.data.evaluations) {
        openEndedResults.push({
          index: grading.index,
          correct: grading.correct,
          explanation: grading.explanation,
        });
      }
    }

    // 6. Combinar resultados y calcular score
    const allResults = [...deterministicResults, ...openEndedResults].sort((a, b) => a.index - b.index);
    const correctCount = allResults.filter((r) => r.correct).length;
    const score = Math.round((correctCount / questions.length) * 100);
    // 7. Construir feedback público (sin correctAnswer)
    const publicDetails = allResults.map((result) => ({
      question: questions[result.index]?.question ?? 'Question',
      correct: result.correct,
      userAnswer: answers[result.index],
      explanation: result.explanation ?? '',
    }));

    const detailFeedback = {
      score,
      details: publicDetails,
    };

    // 8. Llamar a la RPC transaccional finalize_training_evaluation
    // Guardar preguntas completas (con correctAnswer) server-side solamente
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      'finalize_training_evaluation',
      {
        p_employee_id: employee.id,
        p_module_id: moduleId,
        p_questions: questions, // guardadas server-side, no se envían al cliente
        p_answers: answers,
        p_score: score,
        p_feedback: JSON.stringify(detailFeedback),
      }
    );

    if (rpcError) {
      console.error('[Evaluate API] SQL RPC evaluation failed:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to record evaluation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      score: (rpcResult as Record<string, unknown>).score,
      passed: (rpcResult as Record<string, unknown>).passed,
      passingScore: (rpcResult as Record<string, unknown>).passingScore,
      attempts: (rpcResult as Record<string, unknown>).attempts,
      overallProgress: (rpcResult as Record<string, unknown>).overallProgress,
      overallScore: (rpcResult as Record<string, unknown>).overallScore,
      feedback: detailFeedback,
    });
  } catch (error: unknown) {
    console.error('[Evaluate API] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
