/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
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
      timerSeconds = 0,
      currentTopicIndex = 0,
      topicStartIndex = 0,
      isClosingPhase = false,
      sessionId,
      isOpeningPhase: clientOpeningPhase = false,
    } = rawBody;

    // ─── Telemetry Helper ───
    // Logs every detail needed to reproduce and debug any issue.
    // Runs asynchronously so it never blocks the response to the candidate.
    const logTelemetry = async (opts: {
      turnIndex: number;
      model: string;
      promptText?: string;
      responseText?: string;
      reasoningText?: string;
      errorText?: string;
      durationMs?: number;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; reasoning_tokens?: number };
      debugState?: Record<string, unknown>;
    }) => {
      if (!sessionId) return;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseKey) return;

        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('interview_telemetry').insert({
          session_id: sessionId,
          candidate_name: candidateName || null,
          role_title: roleTitle || null,
          turn_index: opts.turnIndex,
          model: opts.model,
          prompt_tokens: opts.usage?.prompt_tokens || 0,
          completion_tokens: opts.usage?.completion_tokens || 0,
          total_tokens: opts.usage?.total_tokens || 0,
          reasoning_tokens: opts.usage?.reasoning_tokens || 0,
          reasoning_text: opts.reasoningText || null,
          prompt_text: opts.promptText || null,
          response_text: opts.responseText || null,
          error_text: opts.errorText || null,
          duration_ms: opts.durationMs || 0,
          raw_payload: {
            ...rawBody,
            _debug: opts.debugState || {},
          },
        });
      } catch (e) {
        console.error('[Telemetry] Failed to log:', e);
      }
    };

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

    // ─── QUESTION COUNTING: Find current topic boundary using [NEXT_TOPIC] markers ───
    // Instead of relying on `topicStartIndex` from the frontend (which can desync),
    // we scan the conversation for the last topic transition marker.
    // Everything AFTER the last [NEXT_TOPIC] belongs to the current topic.
    let lastTopicBoundary = 0;
    for (let i = recentMessages.length - 1; i >= 0; i--) {
      const msg = recentMessages[i];
      if (msg.role === 'assistant' && (
        msg.content.includes('[NEXT_TOPIC]') ||
        // Also detect hardcoded transition messages from the frontend
        /avancemos al siguiente tema|let's move on to the next topic|pasemos al siguiente tema/i.test(msg.content)
      )) {
        lastTopicBoundary = i + 1;
        break;
      }
    }
    const messagesInCurrentTopic = recentMessages.slice(lastTopicBoundary);
    const assistantMessagesInTopic = messagesInCurrentTopic.filter(
      (m: { role: string; content: string }) =>
        m.role === 'assistant' &&
        !m.content.includes('[NEXT_TOPIC]') &&
        !m.content.includes('[END_INTERVIEW]')
    );
    // Don't count the opening greeting as a question.
    // The first assistant message on topic 0 is the greeting, not a question.
    const isFirstTopicWithGreeting = currentTopicIndex === 0 && assistantMessagesInTopic.length > 0 && lastTopicBoundary === 0;
    const zaraQuestionsInCurrentTopic = isFirstTopicWithGreeting
      ? Math.max(0, assistantMessagesInTopic.length - 1)
      : assistantMessagesInTopic.length;

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
    const isOpeningPhase = clientOpeningPhase || isFirstMessage;
    const isTransitionToNewTopic = !isOpeningPhase && zaraQuestionsInCurrentTopic === 0 && currentTopicIndex > 0;

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

    // Build the conversation as structured messages for the model
    // This preserves the real conversational flow so the AI can follow the thread
    const conversationMessages = recentMessages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: m.content,
    }));

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
    if (isOpeningPhase) {
      phaseInstruction = `
PHASE: OPENING (MANDATORY)
This is the START of the interview. You MUST deliver a professional opening:
1. Greet the candidate warmly by name ("${candidateName}")
2. Introduce yourself as Zara, their interviewer for the position of ${roleTitle}
3. Briefly explain the interview format: "This interview will last approximately ${totalMinutes} minutes and we'll discuss ${totalTopics} key areas."
4. Make the candidate feel comfortable with a brief encouraging phrase
5. Then ask your FIRST question about the first topic: "${currentTopic}"

Keep the opening concise but warm (3-4 sentences max before your first question).
Do NOT list all the topics — just mention you'll cover several areas.
End with exactly ONE question about "${currentTopic}".`;
    } else if (isClosingPhase && isLastTopic) {
      phaseInstruction = `
PHASE: CLOSING (MANDATORY)
You have reached the closing phase. Your response MUST:
1. Briefly acknowledge the candidate's last answer (max 8 words)
2. Thank the candidate sincerely for their time and participation
3. Mention that the evaluation team will review the interview and they will be contacted about next steps
4. Wish them well with a warm, encouraging closing
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
1. Provide a smooth transition sentence (e.g., "Muy bien, ahora pasemos a hablar sobre ${currentTopic}.")
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

    // ─── BUILD INSTRUCTION MESSAGE ───
    const instructionContent = isOpeningPhase
      ? `This is the start of the interview. Deliver your professional opening greeting and first question as described in the OPENING phase instructions.`
      : mustAdvanceNow
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
     One question only.`;

    // ─── BUILD MESSAGES ARRAY (Conversational Structure) ───
    // Instead of sending everything as flat text, we send proper role-based messages.
    // This lets the model understand the real conversation flow and maintain context.
    const modelMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add the conversation history as proper alternating messages
    // BUG FIX #1: Merge instruction INTO the last user message to avoid
    // two consecutive 'user' roles which break LLM role alternation.
    if (isOpeningPhase && conversationMessages.length === 0) {
      // No conversation yet — add a single user message with the instruction
      modelMessages.push({ role: 'user', content: `[SYSTEM INSTRUCTION — not from the candidate]\n${instructionContent}` });
    } else if (conversationMessages.length > 0) {
      // Add all messages EXCEPT the last one
      for (let i = 0; i < conversationMessages.length - 1; i++) {
        modelMessages.push({ role: conversationMessages[i].role, content: conversationMessages[i].content });
      }
      // Merge the last message (candidate's reply) WITH the instruction
      const lastMsg = conversationMessages[conversationMessages.length - 1];
      if (lastMsg.role === 'user') {
        // Append instruction to the candidate's message (most common case)
        modelMessages.push({
          role: 'user',
          content: `${lastMsg.content}\n\n---\n[INSTRUCTION FOR ZARA — respond to the candidate's message above]\n${instructionContent}`,
        });
      } else {
        // Edge case: last message is from assistant (shouldn't happen, but be safe)
        modelMessages.push({ role: lastMsg.role, content: lastMsg.content });
        modelMessages.push({ role: 'user', content: `[INSTRUCTION FOR ZARA]\n${instructionContent}` });
      }
    }


    // ─── BUG FIX #4: Fire sentiment analysis IN PARALLEL with main AI call ───
    // Previously, sentiment ran AFTER the AI response, adding 1-3s extra latency.
    // Now both calls run concurrently — the candidate hears Zara faster.
    const lastCandidateMessage = recentMessages.filter((m: { role: string }) => m.role === 'user').pop();
    let sentimentPromise: Promise<Record<string, unknown> | null> | null = null;
    if (lastCandidateMessage) {
      sentimentPromise = (async () => {
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
              return JSON.parse(sentimentMatch[0]);
            }
          }
          return null;
        } catch {
          return null;
        }
      })();
    }

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
        messages: modelMessages,
        reasoning: { enabled: true },
        temperature: 0.7,
        max_tokens: 400,
      }),
    });
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter error:', errorData);

      // LOG THE ERROR — this is the most valuable telemetry
      logTelemetry({
        turnIndex: recentMessages.length + 1,
        model: 'x-ai/grok-4.20',
        promptText: systemPrompt + '\n\n[Instruction]: ' + instructionContent,
        errorText: `HTTP ${response.status}: ${errorData}`,
        durationMs,
        debugState: {
          zaraQuestionsInCurrentTopic,
          maxQuestionsHardLimit,
          currentTopicIndex,
          timerSeconds,
          isClosingPhase,
          mustAdvanceNow,
          isOnLastQuestionOfTopic,
          isLastTopic,
          percentComplete,
          httpStatus: response.status,
        },
      });

      return NextResponse.json(
        { error: 'Failed to get AI response' },
        { status: 500 }
      );
    }

    const data = await response.json();
    let aiMessage = data.choices?.[0]?.message?.content || '';
    const reasoning = data.choices?.[0]?.message?.reasoning || '';
    const usage = data.usage || {};

    // --- TELEMETRY LOGGING (Async — never blocks response) ---
    logTelemetry({
      turnIndex: recentMessages.length + 1,
      model: 'x-ai/grok-4.20',
      promptText: systemPrompt + '\n\n[Instruction]: ' + instructionContent,
      responseText: aiMessage,
      reasoningText: reasoning || null,
      durationMs,
      usage,
      debugState: {
        zaraQuestionsInCurrentTopic,
        maxQuestionsHardLimit,
        questionsRange,
        currentTopicIndex,
        topicStartIndex,
        timerSeconds,
        elapsedMinutes,
        remainingMinutes,
        percentComplete,
        isClosingPhase,
        isLastTopic,
        isOpeningPhase,
        isTransitionToNewTopic,
        mustAdvanceNow,
        isOnLastQuestionOfTopic,
        interviewPaceLabel,
        totalTopics,
        totalMinutes,
        minutesPerTopic,
        effectiveSecondsPerQuestion,
        realisticQuestionsPerTopic,
        currentTopic,
        messagesCount: recentMessages?.length || 0,
      },
    });
    // ---------------------------------

    console.log('AI RAW Response:', aiMessage.substring(0, 200));
    console.log('====== END CHAT API DEBUG ======\n');

    // Strip any "ZARA:" prefix or instruction echoes the model might prepend
    aiMessage = aiMessage.replace(/^(ZARA\s*(\(Entrevistadora\))?\s*:\s*)/i, '').trim();
    aiMessage = aiMessage.replace(/^\[INSTRUCTION[^\]]*\].*?\n/i, '').trim();
    aiMessage = aiMessage.replace(/^\[SYSTEM INSTRUCTION[^\]]*\].*?\n/i, '').trim();

    // ===== Module 5: Sentiment Analysis (runs in parallel — non-blocking) =====
    // BUG FIX #4: Sentiment was running AFTER the main AI call, adding 1-3s latency.
    // Now we fire it concurrently. The promise was started before the main AI call.
    let sentiment = null;
    if (sentimentPromise) {
      try {
        sentiment = await sentimentPromise;
      } catch (err) {
        console.error('Sentiment analysis error (non-blocking):', err);
      }
    }

    return NextResponse.json({ message: aiMessage, sentiment });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Chat API error:', err);

    // Even on catastrophic failure, try to log what happened
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (supabaseUrl && supabaseKey) {
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase.from('interview_telemetry').insert({
          session_id: 'CRASH',
          candidate_name: null,
          role_title: null,
          turn_index: 0,
          model: 'x-ai/grok-4.20',
          error_text: `CRASH: ${err.message}\n\nStack: ${err.stack || 'N/A'}`,
          duration_ms: 0,
        });
      }
    } catch (telemetryErr) {
      console.error('[Telemetry] Failed to log crash:', telemetryErr);
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
