/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const {
      currentTopic,
      allTopics,
      recentMessages,
      language,
      roleTitle,
      roleDescription,
      isLastTopic,
      interviewDuration,
      cvData,
      candidateName,
      // NEW: time & position awareness from frontend
      timerSeconds = 0,
      currentTopicIndex = 0,
      topicStartIndex = 0,
      isClosingPhase = false,
      sessionId,
    } = await req.json();

    // ─── Time calculations ───
    const totalTopics = allTopics?.length || 1;
    const totalMinutes = typeof interviewDuration === 'number' && interviewDuration > 0
      ? interviewDuration
      : 30;
    const totalSeconds = totalMinutes * 60;
    const minutesPerTopic = totalTopics > 0
      ? parseFloat((totalMinutes / totalTopics).toFixed(2))
      : totalMinutes;

    // Real-time awareness
    const elapsedMinutes = (timerSeconds / 60).toFixed(1);
    const remainingSeconds = Math.max(0, totalSeconds - timerSeconds);
    const remainingMinutes = (remainingSeconds / 60).toFixed(1);
    const percentComplete = Math.min(100, Math.round((timerSeconds / totalSeconds) * 100));
    const topicsRemaining = totalTopics - currentTopicIndex;
    const minutesPerRemainingTopic = topicsRemaining > 0
      ? parseFloat((remainingSeconds / 60 / topicsRemaining).toFixed(1))
      : 0;

    // ─── BUG FIX #1: Count questions ONLY from the current topic ───
    // topicStartIndex tells us where in the conversation the current topic began
    const messagesInCurrentTopic = recentMessages.slice(topicStartIndex);
    const zaraQuestionsInCurrentTopic = messagesInCurrentTopic.filter(
      (m: { role: string; content: string }) =>
        m.role === 'assistant' &&
        !m.content.includes('[NEXT_TOPIC]') &&
        !m.content.includes('[END_INTERVIEW]')
    ).length;

    // Adaptive question budget — tuned for real-world TTS overhead (~15-20s per question)
    // For short interviews, each question cycle (AI speaks + candidate responds) takes ~45-60s
    // So we calculate based on realistic throughput, not raw time division
    const effectiveSecondsPerQuestion = totalMinutes <= 10 ? 50 : 40; // TTS is proportionally costlier in short interviews
    const realisticQuestionsPerTopic = Math.max(1, Math.floor((minutesPerTopic * 60) / effectiveSecondsPerQuestion));

    const maxQuestionsHardLimit = Math.min(
      minutesPerTopic < 1   ? 2 :
      minutesPerTopic < 2   ? 3 :
      minutesPerTopic < 3   ? 4 :
      minutesPerTopic < 5   ? 5 :
      minutesPerTopic < 8   ? 6 : 7,
      Math.max(2, realisticQuestionsPerTopic + 1) // never fewer than 2
    );

    const questionsRange =
      minutesPerTopic < 1   ? '1-2'
      : minutesPerTopic < 2 ? '2-3'
      : minutesPerTopic < 3 ? '2-4'
      : minutesPerTopic < 5 ? '3-5'
      : minutesPerTopic < 8 ? '4-6'
      : '5-7';

    const mustAdvanceNow = zaraQuestionsInCurrentTopic >= maxQuestionsHardLimit;
    const isOnLastQuestionOfTopic = zaraQuestionsInCurrentTopic === maxQuestionsHardLimit - 1;

    // Interview pace label
    const interviewPaceLabel =
      totalMinutes <= 7
        ? 'VERY SHORT INTERVIEW: Be ultra-concise. Ask pointed, high-signal questions. Zero small talk. Each question must extract maximum insight in minimum time.'
        : totalMinutes <= 15
          ? 'SHORT INTERVIEW: Be concise and direct. Minimal pleasantries. Focus on the most revealing questions for each topic.'
          : totalMinutes <= 35
            ? 'STANDARD INTERVIEW: Balance depth with pace. Include brief acknowledgments and natural transitions.'
            : totalMinutes <= 55
              ? 'LONG INTERVIEW: You have time to explore deeply. Ask follow-up questions, dig into examples, and probe edge cases.'
              : 'VERY LONG INTERVIEW: Explore topics thoroughly. Use storytelling prompts, edge cases, and lessons learned.';

    // ─── Interview phase detection ───
    const isFirstMessage = recentMessages.filter((m: { role: string }) => m.role === 'user').length === 0;
    const isOpeningPhase = isFirstMessage || (zaraQuestionsInCurrentTopic === 0 && currentTopicIndex === 0);
    const isTransitionToNewTopic = zaraQuestionsInCurrentTopic === 0 && currentTopicIndex > 0;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    const lang = language === 'es' ? 'Spanish (Español)' : 'English';

    console.log('\n====== CHAT API DEBUG ======');
    console.log('Topic:', currentTopic, `(${currentTopicIndex + 1}/${totalTopics})`);
    console.log('Role:', roleTitle);
    console.log('Timer:', `${elapsedMinutes}m elapsed / ${remainingMinutes}m remaining (${percentComplete}%)`);
    console.log('Questions in topic:', zaraQuestionsInCurrentTopic, '/', maxQuestionsHardLimit);
    console.log('Closing phase:', isClosingPhase);
    console.log('Messages count:', recentMessages.length, '| topicStartIndex:', topicStartIndex);
    console.log('CV Data present:', !!cvData);

    // ─── Helper: ensure every topic has a rubric ───
    const ensureRubric = (t: { label: string; rubric?: { weight?: number; excellent?: string; acceptable?: string; poor?: string } }) => {
      const r = t.rubric;
      const weight = r?.weight ?? 5;
      const excellent = (r?.excellent && r.excellent.trim()) || `Dominio sobresaliente en ${t.label}; demuestra experiencia avanzada con ejemplos concretos`;
      const acceptable = (r?.acceptable && r.acceptable.trim()) || `Conocimiento funcional en ${t.label}; puede aplicarlo con supervisión mínima`;
      const poor = (r?.poor && r.poor.trim()) || `Carencias notables en ${t.label}; no logra demostrar competencia básica`;
      return { weight, excellent, acceptable, poor };
    };

    // Build topic list with status indicators AND rubric-aware depth hints
    const topicList = allTopics
      ? allTopics.map((t: { label: string; status: string; rubric?: { weight: number; excellent: string; acceptable: string; poor: string } }, i: number) => {
        const icon = t.status === 'completed' ? '✅' : t.status === 'current' ? '👉' : '⏳';
        const rubric = ensureRubric(t);

        let depthHint = '';
        if (rubric.weight >= 8) {
          depthHint = ' [DEEP DIVE — prioritize this topic]';
        } else if (rubric.weight <= 3) {
          depthHint = ' [QUICK — 1-2 questions max]';
        }

        let criteriaHint = '';
        if (t.status === 'current') {
          criteriaHint = `\n      → Evaluate if candidate can: "${rubric.excellent}"`;
        }

        return `  ${i + 1}. ${icon} ${t.label} (Weight: ${rubric.weight}/10)${depthHint} [${t.status}]${criteriaHint}`;
      }).join('\n')
      : `  - ${currentTopic}`;

    // Full rubric block
    const rubricBlock = allTopics
      ? allTopics.map((t: { label: string; status: string; rubric?: { weight: number; excellent: string; acceptable: string; poor: string } }) => {
        const r = ensureRubric(t);
        const criticality = r.weight >= 8 ? 'CRITICAL' : r.weight >= 5 ? 'IMPORTANT' : 'BASIC';
        return `  CRITERION: ${t.label} (Weight: ${r.weight}/10 — ${criticality})
  ✅ EXCELLENT: ${r.excellent}
  ⚡ ACCEPTABLE: ${r.acceptable}
  ❌ DEFICIENT: ${r.poor}`;
      }).join('\n\n')
      : '';

    // Build the conversation as a formatted transcript
    const conversationLines = recentMessages.map((m: { role: string; content: string }) => {
      if (m.role === 'assistant') {
        return `ZARA (Entrevistadora): ${m.content}`;
      } else {
        return `CANDIDATO: ${m.content}`;
      }
    }).join('\n\n');

    // Current topic rubric for enhanced guidance
    const currentTopicData = allTopics?.find((t: { label: string; status: string }) => t.label === currentTopic);
    const currentRubric = currentTopicData ? ensureRubric(currentTopicData) : null;
    const rubricGuidance = currentRubric
      ? `\nEVALUATION GUIDE FOR CURRENT TOPIC: You want to discover if the candidate demonstrates: "${currentRubric.excellent}". An acceptable candidate would show: "${currentRubric.acceptable}". A weak candidate would show: "${currentRubric.poor}". Ask questions that reveal which level the candidate is at.`
      : '';

    // Build CV profile section
    let cvProfileSection = '';
    let cvVerificationInstructions = '';
    if (cvData && typeof cvData === 'object' && (cvData.name || cvData.experience?.length || cvData.skills?.length)) {
      cvProfileSection = `

=== CANDIDATE PROFILE (extracted from their CV) ===
Name: ${cvData.name || candidateName || 'Unknown'}
Current/Last Title: ${cvData.currentTitle || 'Not specified'}
Years of Experience: ${cvData.totalYearsExperience || 'Not specified'}
Professional Summary: ${cvData.summary || 'Not provided'}

Work Experience:
${(cvData.experience || []).map((exp: { company?: string; title?: string; startDate?: string; endDate?: string; duration?: string; responsibilities?: string[]; achievements?: string[] }) =>
  `- ${exp.title || 'Role'} at ${exp.company || 'Company'} (${exp.startDate || '?'} - ${exp.endDate || '?'}, ${exp.duration || 'unknown duration'})
  Responsibilities: ${(exp.responsibilities || []).join(', ') || 'Not listed'}
  Achievements: ${(exp.achievements || []).join(', ') || 'Not listed'}`
).join('\n') || 'No experience listed'}

Education:
${(cvData.education || []).map((edu: { degree?: string; field?: string; institution?: string; year?: string }) =>
  `- ${edu.degree || 'Degree'} in ${edu.field || 'Field'} at ${edu.institution || 'Institution'} (${edu.year || 'Year unknown'})`
).join('\n') || 'No education listed'}

Skills: ${(cvData.skills || []).join(', ') || 'Not listed'}
Languages: ${(cvData.languages || []).join(', ') || 'Not listed'}
Certifications: ${(cvData.certifications || []).join(', ') || 'None listed'}
Red Flags Detected: ${(cvData.redFlags || []).length > 0 ? cvData.redFlags.join('; ') : 'None detected'}
=== END CANDIDATE PROFILE ===`;

      cvVerificationInstructions = `

CV VERIFICATION INSTRUCTIONS:
You have access to the candidate's CV profile above. You MUST incorporate BOTH types of questions:

TYPE 1 — VACANCY QUESTIONS (60% of your questions):
Technical and situational questions related to the job topics listed above.

TYPE 2 — CV VERIFICATION QUESTIONS (40% of your questions):
Based on the candidate's CV, generate questions to VERIFY and DEEPEN understanding:

a) EXPERIENCE VERIFICATION:
- Reference specific companies/roles from their CV: "I see you worked at [company] as [title] for [duration]. What was your biggest achievement there?"
- Ask about specific responsibilities: "How did you handle [specific responsibility from CV]? Give me a concrete example."
- Probe employment gaps if any were detected in redFlags.

b) SKILLS VERIFICATION:
- "You list [skill] on your CV. Walk me through a real project where you applied it."
- "What's your current proficiency in [skill]? Which projects best demonstrate it?"

c) COHERENCE CHECKS:
- If there are career gaps (check redFlags): ask what they did during that time
- If they progressed very quickly: ask how they achieved that progression
- If they changed jobs frequently: ask about their reasons

d) SOFT SKILLS FROM HISTORY:
- "How did you handle conflicts in your team at [company X]?"
- "What did you learn from your time at [company Y] that you apply today?"

PROPORTION: Alternate naturally between vacancy questions and CV verification. Don't cluster all CV questions together.

CONSISTENCY TRACKING: Mentally track if the candidate's verbal answers are consistent with their CV claims. If you detect inconsistencies, probe deeper with follow-up questions. At the end of the interview, your final message before [END_INTERVIEW] should include an internal note: "[CV_CONSISTENCY: Alta/Media/Baja]" to flag the consistency level.`;
    }

    // ─── Build previous questions list (for anti-repetition) ───
    const previousQuestions = recentMessages
      .filter((m: { role: string }) => m.role === 'assistant')
      .map((m: { content: string }, i: number) => `  Q${i + 1}: "${m.content.substring(0, 100)}..."`)
      .join('\n') || '  (none yet)';

    // ─── TIME STATUS BLOCK ───
    const timeStatusBlock = `
━━━ TIME STATUS (REAL-TIME — USE THIS TO PACE YOURSELF) ━━━
⏱ Elapsed: ${elapsedMinutes} min of ${totalMinutes} min total (${percentComplete}% complete)
⏳ Remaining: ${remainingMinutes} min
📍 Current Topic: ${currentTopicIndex + 1} of ${totalTopics} ("${currentTopic}")
📊 Topics remaining after this: ${topicsRemaining - 1}
⏰ Available time per remaining topic: ~${minutesPerRemainingTopic} min
🔢 Questions asked on this topic: ${zaraQuestionsInCurrentTopic} of ${maxQuestionsHardLimit} max
${isClosingPhase ? '\n🔴 CLOSING PHASE ACTIVE — You are at 90%+ of the interview time. You MUST wrap up now.' : ''}`;

    // ─── INTERVIEW PHASE INSTRUCTIONS ───
    let phaseInstruction = '';
    if (isClosingPhase && isLastTopic) {
      phaseInstruction = `
PHASE: CLOSING (MANDATORY)
You have reached the closing phase. Your response MUST:
1. Briefly acknowledge the candidate's last answer (max 8 words)
2. Thank the candidate for their time and participation
3. Mention that the evaluation team will review the interview
4. Wish them well
5. Append [END_INTERVIEW] at the end
DO NOT ask any more questions. This is the final message.`;
    } else if (isClosingPhase) {
      phaseInstruction = `
PHASE: CLOSING — ACCELERATE
Time is almost up. Skip to your final question and append [NEXT_TOPIC] to advance quickly.
If you're on the last topic, close the interview with [END_INTERVIEW].`;
    } else if (isTransitionToNewTopic) {
      phaseInstruction = `
PHASE: TOPIC TRANSITION
You are transitioning to a new topic: "${currentTopic}".
Your response MUST:
1. Provide a smooth transition sentence (e.g., "Excellent, now let's move on to ${currentTopic}.")
2. Ask your FIRST question about this new topic
The transition should feel natural, like a professional interviewer guiding the conversation.`;
    } else {
      phaseInstruction = `
PHASE: EXPLORATION
Continue exploring topic "${currentTopic}". Ask probing, follow-up questions that dig deeper into the candidate's knowledge.
${currentRubric ? `Your goal: determine if the candidate reaches EXCELLENT level ("${currentRubric.excellent}") or falls to POOR level ("${currentRubric.poor}").` : ''}`;
    }

    // ─── SYSTEM PROMPT v2.0 ───
    const systemPrompt = `You are Zara, a Senior HR Recruiter at a top-tier corporation conducting a professional structured interview.
You are an EXPERT interviewer trained in behavioral interviewing techniques (STAR method), technical assessment, and candidate evaluation.

YOUR IDENTITY: Professional, warm but focused, efficient. You make candidates feel respected while extracting maximum signal from every answer.

JOB INFO:
- Title: ${roleTitle}
- Description: ${roleDescription}
${cvProfileSection}

INTERVIEW STRUCTURE (${totalTopics} topics in ${totalMinutes} minutes):
${topicList}

EVALUATION RUBRIC:
${rubricBlock || '  No specific rubric — evaluate general competence.'}

CURRENT TOPIC: ${currentTopic}${rubricGuidance}
${cvVerificationInstructions}

${timeStatusBlock}

${phaseInstruction}

━━━ INTERVIEWER METHODOLOGY ━━━

You follow a professional interview methodology:

1. ACKNOWLEDGE → PROBE → EVALUATE
   - First: Brief acknowledgment of the candidate's answer (2-8 words max, never empty)
   - Then: One focused question that digs deeper based on what they said
   - Internally: Evaluate if their answer reveals EXCELLENT, ACCEPTABLE, or POOR competence

2. QUESTION TYPES (vary these):
   - BEHAVIORAL: "Tell me about a time when..." / "Describe a situation where..."
   - TECHNICAL: "How would you implement..." / "Explain how..."
   - SITUATIONAL: "What would you do if..." / "Imagine that..."
   - PROBING: "Can you elaborate on..." / "What specifically did you do when..."

3. DEPTH CALIBRATION:
   - If the candidate gives a STRONG answer → ask a harder follow-up to find their ceiling
   - If the candidate gives a WEAK answer → ask a simpler version or move on (don't torture them)
   - If the candidate gives a VAGUE answer → ask for a specific example or concrete detail

━━━ STRICT RULES (FOLLOW EXACTLY) ━━━

RULE 1 — ONE QUESTION ONLY: Each response contains exactly ONE question. Never list multiple questions or sub-questions.

RULE 2 — CONTEXT CONTINUITY: Your question MUST logically follow the candidate's last answer.
Brief acknowledgment (2-8 words), then your new question.

RULE 3 — QUESTION COUNTER (CRITICAL — NO EXCEPTIONS):
You have asked ${zaraQuestionsInCurrentTopic} questions on the CURRENT topic "${currentTopic}".
Maximum allowed for this topic: ${maxQuestionsHardLimit} questions.
Questions remaining for this topic: ${maxQuestionsHardLimit - zaraQuestionsInCurrentTopic}.
${mustAdvanceNow
  ? `⛔ LIMIT REACHED: You have asked the maximum ${maxQuestionsHardLimit} questions on "${currentTopic}". 
     You MUST ${isLastTopic ? 'close the interview now with a professional goodbye and append [END_INTERVIEW]' : 'smoothly transition to the next topic and append [NEXT_TOPIC]'}. 
     DO NOT ask another question on this topic.`
  : isOnLastQuestionOfTopic
    ? `⚠️ FINAL QUESTION for this topic: This is your last allowed question on "${currentTopic}". 
       After asking it, append ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} at the end.`
    : `✅ You may ask ${maxQuestionsHardLimit - zaraQuestionsInCurrentTopic} more question(s) on this topic.`
}

RULE 4 — NEVER REPEAT QUESTIONS: 
The following questions have ALREADY been asked — DO NOT ask about them again in any form:
${previousQuestions}

RULE 5 — DEAD END DETECTION:
If the candidate gives 2+ consecutive empty, dismissive, or off-topic answers ("no sé", "tampoco sé", "I don't know", or responses under 5 words), 
you MUST immediately output ONLY: ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} — no additional text.

RULE 6 — PACE: ${interviewPaceLabel}
Total: ${totalMinutes} min, ${totalTopics} topics, ~${minutesPerTopic.toFixed(1)} min/topic, ~${questionsRange} questions/topic.

RULE 7 — LANGUAGE: Respond ONLY in ${lang}. No exceptions.

RULE 8 — TRANSITIONS: When you include [NEXT_TOPIC], you MUST say a brief transition sentence BEFORE the tag. Example: "Gracias por compartir eso. Pasemos al siguiente tema. [NEXT_TOPIC]"

RULE 9 — PROFESSIONAL CLOSING: When you include [END_INTERVIEW], end with a warm, professional goodbye. Thank the candidate for their time and mention that the team will be in touch.`;

    // ─── USER MESSAGE ───
    const userMessage = `INTERVIEW TRANSCRIPT:
${conversationLines}

---
INSTRUCTION FOR ZARA:
${mustAdvanceNow
  ? `You have reached the question limit for topic "${currentTopic}" (${zaraQuestionsInCurrentTopic}/${maxQuestionsHardLimit} questions asked). 
     ${isLastTopic 
       ? 'Deliver a professional closing: thank the candidate, mention next steps, and append [END_INTERVIEW].' 
       : 'Write a smooth transition sentence acknowledging the topic, then append [NEXT_TOPIC].'}`
  : isClosingPhase && isLastTopic
    ? `TIME IS UP. Deliver your professional closing message. Thank the candidate for their time and append [END_INTERVIEW].`
    : isClosingPhase
      ? `TIME IS RUNNING OUT (${remainingMinutes} min left). Ask one final quick question and append ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'}.`
      : `Ask question #${zaraQuestionsInCurrentTopic + 1} of max ${maxQuestionsHardLimit} about "${currentTopic}". 
     DO NOT repeat any question already asked (see Rule 4). 
     ${isOnLastQuestionOfTopic ? `This is your LAST question for this topic — after asking it, append ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} at the end.` : ''}
     ${isTransitionToNewTopic ? `This is a NEW TOPIC — start with a smooth transition from the previous topic.` : 'Base your question on the candidate\'s last answer.'}
     One question only.`
}`;


    const startTime = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify AI Interviewer',
      },
      body: JSON.stringify({
        model: 'x-ai/grok-4.20',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        reasoning: { enabled: true },
        temperature: 0.7,
        max_tokens: 300,
      }),
    });
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter error:', errorData);
      return NextResponse.json(
        { error: 'Failed to get AI response' },
        { status: 500 }
      );
    }

    const data = await response.json();
    let aiMessage = data.choices?.[0]?.message?.content || '';
    const reasoning = data.choices?.[0]?.message?.reasoning || '';
    const usage = data.usage || {};

    // --- TELEMETRY LOGGING (Async) ---
    if (sessionId) {
      // Execute in background to not block the response
      (async () => {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          // Use service role if available to bypass RLS, otherwise fallback to anon
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          
          if (supabaseUrl && supabaseKey) {
            const supabase = createClient(supabaseUrl, supabaseKey);
            await supabase.from('interview_telemetry').insert({
              session_id: sessionId,
              candidate_name: candidateName,
              role_title: roleTitle,
              turn_index: recentMessages.length + 1,
              model: 'x-ai/grok-4.20',
              prompt_tokens: usage.prompt_tokens || 0,
              completion_tokens: usage.completion_tokens || 0,
              total_tokens: usage.total_tokens || 0,
              reasoning_tokens: usage.reasoning_tokens || 0,
              reasoning_text: reasoning,
              prompt_text: systemPrompt + '\n\n' + userMessage,
              response_text: aiMessage,
              duration_ms: durationMs,
            });
          }
        } catch (e) {
          console.error('Failed to log telemetry:', e);
        }
      })();
    }
    // ---------------------------------

    console.log('AI RAW Response:', aiMessage.substring(0, 200));
    console.log('====== END CHAT API DEBUG ======\n');

    // Strip any "ZARA:" prefix the model might prepend
    aiMessage = aiMessage.replace(/^(ZARA\s*(\(Entrevistadora\))?\s*:\s*)/i, '').trim();

    // ===== Module 5: Sentiment Analysis =====
    const lastCandidateMessage = recentMessages.filter((m: { role: string }) => m.role === 'user').pop();
    let sentiment = null;
    
    if (lastCandidateMessage) {
      try {
        const sentimentResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
              {
                role: 'system',
                content: `Analyze this interview response for sentiment signals. Return JSON only: { "confidence": <0-100>, "evasion": <boolean>, "keySignals": ["<signal1>", "<signal2>"] }
Rules:
- confidence: How confident/assured the candidate sounds (0=very anxious/uncertain, 100=very confident/clear)
- evasion: true if the candidate avoids answering directly, gives vague non-answers, or redirects
- keySignals: 2-3 brief labels like "specific examples", "vague language", "strong technical depth", "hedging", "clear articulation", "inconsistency"
Return ONLY valid JSON, no markdown.`
              },
              {
                role: 'user',
                content: `Candidate response: "${lastCandidateMessage.content}"`
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
          }),
        });

        if (sentimentResponse.ok) {
          const sentimentData = await sentimentResponse.json();
          const sentimentContent = sentimentData.choices?.[0]?.message?.content || '';
          const sentimentMatch = sentimentContent.match(/\{[\s\S]*\}/);
          if (sentimentMatch) {
            sentiment = JSON.parse(sentimentMatch[0]);
          }
        }
      } catch (err) {
        console.error('Sentiment analysis error (non-blocking):', err);
        // Sentiment analysis failure is non-critical — continue without it
      }
    }

    return NextResponse.json({ message: aiMessage, sentiment });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
