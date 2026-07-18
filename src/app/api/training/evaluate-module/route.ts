import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import { evaluateTrainingModuleSchema } from '@/lib/training/contracts';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

    // Transform array to internal Record<number, string> structure
    const answers: Record<number, string> = {};
    for (const item of rawAnswers) {
      answers[item.questionIndex] = item.answer;
    }

    const admin = createAdminClient();

    // 2. Cargar el módulo asignado
    const { data: moduleData, error: modError } = await admin
      .from('training_modules')
      .select('*')
      .eq('id', moduleId)
      .eq('program_id', employee.program_id)
      .maybeSingle();

    if (modError || !moduleData) {
      console.error('[Evaluate API] Module load error:', modError);
      return NextResponse.json({ error: 'Assigned module not found' }, { status: 404 });
    }

    const questions = (moduleData.evaluation_questions || []) as any[];
    if (questions.length === 0) {
      return NextResponse.json({ error: 'This module has no evaluation questions' }, { status: 400 });
    }

    // 3. Calificar respuestas
    const deterministicResults: { index: number; correct: boolean; explanation?: string }[] = [];
    const openEndedToEvaluate: { index: number; question: string; answerExpected: string; answerGiven: string }[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const answerGiven = answers[i] || '';

      if (q.type === 'multiple_choice' || q.type === 'true_false') {
        const expected = String(q.correctAnswer || '').trim().toLowerCase();
        const given = String(answerGiven).trim().toLowerCase();
        const isCorrect = expected === given;

        deterministicResults.push({
          index: i,
          correct: isCorrect,
          explanation: q.explanation || '',
        });
      } else if (q.type === 'open_ended') {
        openEndedToEvaluate.push({
          index: i,
          question: q.question,
          answerExpected: q.correctAnswer || '',
          answerGiven: String(answerGiven),
        });
      }
    }

    const openEndedResults: { index: number; correct: boolean; explanation: string }[] = [];

    if (openEndedToEvaluate.length > 0) {
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL || 'google/gemini-2.5-flash';

      if (!OPENROUTER_API_KEY) {
        return NextResponse.json({ error: 'AI service not configured for grading open questions' }, { status: 503 });
      }

      try {
        const aiPrompt = `You are a strict grading assistant. Evaluate the user's answers against the expected correct answers for these open-ended questions.
Determine if they are conceptually correct (correct: true/false) and provide a short 1-sentence explanation of why.

QUESTIONS TO EVALUATE:
${JSON.stringify(openEndedToEvaluate, null, 2)}

Return JSON format:
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

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '{}';
          const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
          const structured = JSON.parse(cleanContent);

          if (Array.isArray(structured.evaluations)) {
            for (const grading of structured.evaluations) {
              openEndedResults.push({
                index: grading.index,
                correct: !!grading.correct,
                explanation: grading.explanation || '',
              });
            }
          }
        }
      } catch (aiErr) {
        console.error('[Evaluate API] AI grading failed, treating open questions as incorrect:', aiErr);
        for (const oq of openEndedToEvaluate) {
          openEndedResults.push({
            index: oq.index,
            correct: false,
            explanation: 'Grading system was offline. Answer could not be validated.',
          });
        }
      }
    }

    // Combinar resultados y calcular score
    const allResults = [...deterministicResults, ...openEndedResults].sort((a, b) => a.index - b.index);
    const correctCount = allResults.filter(r => r.correct).length;
    const score = Math.round((correctCount / questions.length) * 100);

    const detailFeedback = {
      score,
      details: allResults.map(r => ({
        question: questions[r.index]?.question || 'Question',
        correct: r.correct,
        userAnswer: answers[r.index] || '',
        correctAnswer: questions[r.index]?.correctAnswer || '',
        explanation: r.explanation || '',
      })),
    };

    // 4. Llamar a la RPC transaccional finalize_training_evaluation
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      'finalize_training_evaluation',
      {
        p_employee_id: employee.id,
        p_module_id: moduleId,
        p_questions: questions,
        p_answers: answers,
        p_score: score,
        p_feedback: JSON.stringify(detailFeedback),
      }
    );

    if (rpcError) {
      console.error('[Evaluate API] SQL RPC evaluation failed:', rpcError);
      return NextResponse.json({ error: rpcError.message || 'Failed to record evaluation' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      score: rpcResult.score,
      passed: rpcResult.passed,
      passingScore: rpcResult.passingScore,
      attempts: rpcResult.attempts,
      overallProgress: rpcResult.overallProgress,
      overallScore: rpcResult.overallScore,
      feedback: detailFeedback,
    });
  } catch (error: any) {
    console.error('[Evaluate API] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
