import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      messages,
      moduleContent,
      employeeName,
      roleTitle,
      companyContext,
      personalizationNotes,
      moduleTitle,
      evaluationMode,
      sessionId,
      employeeId,
      moduleId,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Messages array is required' },
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

    const companyName = companyContext?.name || 'the company';

    // Build personalization context
    const personalization = personalizationNotes
      ? `
PERSONALIZATION (based on their interview):
- Strengths: ${personalizationNotes.strengths || 'Not available'}
- Areas to develop: ${personalizationNotes.areasToWatch || 'Not available'}
- Learning style: ${personalizationNotes.learningStyle || 'Not available'}
- Special tips: ${personalizationNotes.customTips || 'Not available'}`
      : '';

    const systemPrompt = `You are "Zara", an AI training mentor at ${companyName}. You are guiding ${employeeName || 'the employee'} through their onboarding training for the role of ${roleTitle || 'their new position'}.

CURRENT MODULE: ${moduleTitle || 'Training Module'}
MODULE CONTENT:
${moduleContent || 'No specific content provided.'}
${personalization}

YOUR BEHAVIOR:
1. Present information clearly and engagingly, breaking complex topics into digestible pieces
2. Ask questions periodically to check understanding (don't just lecture)
3. Use the employee's strengths to make connections ("Given your experience in X, you'll find that...")
4. Pay special attention to their areas to watch - spend more time on those topics
5. Be encouraging but honest about what's important
6. After covering all key points, let the employee know they can proceed to the evaluation
7. If in evaluation mode, ask quiz questions one by one, grade answers, and provide explanations
8. Always respond in the same language the employee uses (Spanish/English)
9. Be conversational and warm, like a helpful colleague, not a textbook
10. Use concrete examples relevant to the company whenever possible

${evaluationMode ? 'You are now in EVALUATION MODE. Ask quiz questions one at a time from the module content. After each answer, tell them if they are correct and explain why. Track their score.' : 'You are in TEACHING MODE. Present the module content engagingly and check understanding periodically.'}`;

    // Build messages array for the API
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((msg: { role: string; content: string }) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

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
        messages: apiMessages,
        temperature: 0.7,
        max_tokens: 800,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[training/chat] AI API error:', errorText);
      return NextResponse.json(
        { error: 'AI service unavailable. Please try again.' },
        { status: 502 }
      );
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '';

    if (!responseContent) {
      return NextResponse.json(
        { error: 'AI returned empty response. Please try again.' },
        { status: 502 }
      );
    }

    // Detect metadata from response content
    const metadata: {
      isQuizQuestion?: boolean;
      evaluationComplete?: boolean;
      score?: number;
      sessionId?: string;
    } = {};

    // Heuristic detection of quiz questions (AI asking a question in evaluation mode)
    if (evaluationMode) {
      metadata.isQuizQuestion = true;

      // Check if evaluation seems complete (AI mentions final score)
      const scoreMatch = responseContent.match(
        /(?:final score|puntuaci[oó]n final|resultado final|score final)[:\s]*(\d+)/i
      );
      if (scoreMatch) {
        metadata.evaluationComplete = true;
        metadata.score = parseInt(scoreMatch[1], 10);
      }
    }

    // Persist messages to training_sessions (non-blocking)
    if (employeeId && moduleId) {
      try {
        const supabase = await createClient();
        const allMessages = [
          ...messages.map((msg: { role: string; content: string; timestamp?: number }) => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || Date.now(),
          })),
          {
            role: 'assistant',
            content: responseContent,
            timestamp: Date.now(),
          },
        ];

        if (sessionId) {
          // Update existing session
          await supabase
            .from('training_sessions')
            .update({
              messages: allMessages,
              ended_at: metadata.evaluationComplete ? new Date().toISOString() : null,
            })
            .eq('id', sessionId);
        } else {
          // Create new session
          const { data: newSession } = await supabase
            .from('training_sessions')
            .insert({
              employee_id: employeeId,
              module_id: moduleId,
              session_type: evaluationMode ? 'evaluation' : 'module',
              messages: allMessages,
            })
            .select('id')
            .single();

          if (newSession) {
            metadata.sessionId = newSession.id;
          }
        }
      } catch (persistError) {
        // Non-blocking: chat continues even if persistence fails
        console.error('[training/chat] Session persist error:', persistError);
      }
    }

    return NextResponse.json({
      success: true,
      message: responseContent,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  } catch (error) {
    const err = error as Error;
    console.error('[training/chat] failure:', {
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
