import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { moduleId, employeeId, conversationHistory, moduleContent } = body;

    if (!moduleId || !employeeId || !conversationHistory) {
      return NextResponse.json(
        { error: 'Missing required fields: moduleId, employeeId, conversationHistory' },
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

    // Format conversation for evaluation
    const conversationText = conversationHistory
      .map((msg: { role: string; content: string }) => `${msg.role === 'assistant' ? 'Tutor' : 'Employee'}: ${msg.content}`)
      .join('\n\n');

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
            content: `You are an expert training evaluator. Analyze the training conversation between a tutor and employee to assess how well the employee understood the module content. Be fair but rigorous. Respond ONLY with valid JSON.`,
          },
          {
            role: 'user',
            content: `Based on this training conversation, evaluate how well the employee understood the module content.

MODULE CONTENT COVERED:
${moduleContent || 'Not provided'}

TRAINING CONVERSATION:
${conversationText}

Evaluate and return JSON with:
{
  "score": <number 0-100>,
  "passed": <boolean, true if score >= 70>,
  "feedback": "Overall feedback paragraph about their performance",
  "strongAreas": ["Area they understood well 1", "Area 2"],
  "weakAreas": ["Area that needs review 1", "Area 2"],
  "recommendation": "What they should do next - review specific topics, proceed to next module, etc."
}`,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[evaluate-module] AI API error:', errorText);
      return NextResponse.json(
        { error: 'AI evaluation service unavailable. Please try again.' },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let evaluation;
    try {
      evaluation = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[evaluate-module] JSON parse error:', jsonStr.substring(0, 500));
      return NextResponse.json(
        { error: 'Failed to parse evaluation. Please try again.' },
        { status: 500 }
      );
    }

    // Ensure valid score
    const score = Math.min(100, Math.max(0, Number(evaluation.score) || 0));
    const passed = score >= 70;

    const supabase = await createClient();

    // 1. Update training_progress for this module
    const { error: progressError } = await supabase
      .from('training_progress')
      .update({
        status: passed ? 'completed' : 'failed',
        score,
        feedback: evaluation.feedback || null,
        completed_at: passed ? new Date().toISOString() : null,
      })
      .eq('employee_id', employeeId)
      .eq('module_id', moduleId);

    if (progressError) {
      console.error('[evaluate-module] Progress update error:', progressError);
    }

    // 2. If passed, unlock the next module
    if (passed) {
      // Get current module's order to find the next one
      const { data: currentProgress } = await supabase
        .from('training_progress')
        .select('module_id, training_modules(order_index, program_id)')
        .eq('employee_id', employeeId)
        .eq('module_id', moduleId)
        .single();

      if (currentProgress?.training_modules) {
        const moduleData = currentProgress.training_modules as unknown as {
          order_index: number;
          program_id: string;
        };

        // Find the next module in order
        const { data: nextModule } = await supabase
          .from('training_modules')
          .select('id')
          .eq('program_id', moduleData.program_id)
          .eq('order_index', moduleData.order_index + 1)
          .single();

        if (nextModule) {
          await supabase
            .from('training_progress')
            .update({ status: 'available' })
            .eq('employee_id', employeeId)
            .eq('module_id', nextModule.id)
            .eq('status', 'locked');
        }
      }
    }

    // 3. Insert into training_evaluations
    const { error: evalError } = await supabase
      .from('training_evaluations')
      .insert({
        employee_id: employeeId,
        module_id: moduleId,
        score,
        passed,
        feedback: evaluation.feedback || '',
        strong_areas: evaluation.strongAreas || [],
        weak_areas: evaluation.weakAreas || [],
        recommendation: evaluation.recommendation || '',
        conversation_summary: conversationText.substring(0, 5000),
      });

    if (evalError) {
      console.error('[evaluate-module] Evaluation insert error:', evalError);
    }

    // 4. Recalculate overall_progress for the employee
    const { data: allProgress } = await supabase
      .from('training_progress')
      .select('status')
      .eq('employee_id', employeeId);

    if (allProgress && allProgress.length > 0) {
      const completedCount = allProgress.filter((p) => p.status === 'completed').length;
      const overallProgress = Math.round((completedCount / allProgress.length) * 100);

      await supabase
        .from('training_employees')
        .update({
          overall_progress: overallProgress,
          status: overallProgress === 100 ? 'completed' : 'active',
        })
        .eq('id', employeeId);
    }

    return NextResponse.json({
      success: true,
      evaluation: {
        score,
        passed,
        feedback: evaluation.feedback || '',
        strongAreas: evaluation.strongAreas || [],
        weakAreas: evaluation.weakAreas || [],
        recommendation: evaluation.recommendation || '',
      },
    });
  } catch (error) {
    const err = error as Error;
    console.error('[evaluate-module] failure:', {
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
