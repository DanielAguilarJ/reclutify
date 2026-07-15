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
      isGracePeriod = false,
      sessionId,
      interviewMode = 'restricted',
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

    // ─── Time calculations (powered by InterviewTimingEngine) ───
    const { computeInterviewPlan, getQuestionBudget, computeRealTimePacing } = await import('@/lib/interviewTimingEngine');

    const totalTopics = allTopics?.length || 1;
    const totalMinutes = typeof interviewDuration === 'number' && interviewDuration > 0
      ? interviewDuration
      : 30;
    const totalSeconds = totalMinutes * 60;

    // Build topic inputs with weights from rubric data
    const engineTopics = (allTopics || []).map((t: { label: string; rubric?: { weight?: number } }) => ({
      label: t.label,
      weight: t.rubric?.weight ?? 5,
    }));

    // Compute the full interview plan using the timing engine
    const interviewPlan = computeInterviewPlan(totalMinutes, engineTopics, {
      hasCv: !!(cvData && typeof cvData === 'object' && (cvData.name || cvData.experience?.length || cvData.skills?.length)),
    });

    // Get budget for the current topic
    const currentTopicBudget = getQuestionBudget(currentTopicIndex, interviewPlan);
    const { paceConfig } = interviewPlan;

    // Real-time awareness
    const elapsedMinutes = (timerSeconds / 60).toFixed(1);
    const remainingSeconds = Math.max(0, totalSeconds - timerSeconds);
    const remainingMinutes = (remainingSeconds / 60).toFixed(1);
    const percentComplete = Math.min(100, Math.round((timerSeconds / totalSeconds) * 100));
    const topicsRemaining = totalTopics - currentTopicIndex;
    const minutesPerRemainingTopic = topicsRemaining > 0
      ? parseFloat((remainingSeconds / 60 / topicsRemaining).toFixed(1))
      : 0;
    const minutesPerTopic = totalTopics > 0
      ? parseFloat((totalMinutes / totalTopics).toFixed(2))
      : totalMinutes;

    // ─── QUESTION COUNTING (Bug 1 + 6 fix) ───
    // Trust the client-provided `topicStartIndex` instead of scanning for fragile
    // natural-language transition phrases. The client already knows when it
    // advanced topics (it called `nextTopic()` in response to [NEXT_TOPIC] or a
    // forced advance). Counting messages from that boundary forward is exact.
    //
    // The opening greeting CONTAINS a real question (we tell the model to end
    // with one), so it MUST count as the first question of topic 0 — otherwise
    // topic 0 ends up with budget+1 questions while every other topic gets budget.
    const safeTopicStart = Math.max(0, Math.min(topicStartIndex || 0, recentMessages.length));
    const messagesInCurrentTopic = recentMessages.slice(safeTopicStart);
    const assistantMessagesInTopic = messagesInCurrentTopic.filter(
      (m: { role: string; content: string }) =>
        m.role === 'assistant' &&
        !m.content.includes('[NEXT_TOPIC]') &&
        !m.content.includes('[END_INTERVIEW]')
    );
    const zaraQuestionsInCurrentTopic = assistantMessagesInTopic.length;

    // ─── Engine-driven question budget ───
    const baseHardLimit = currentTopicBudget.questionBudget;

    // Real-time pacing analysis. Grace-period mode suppresses time-based urgency
    // so the LLM finishes remaining topics at a natural pace instead of being
    // told to rush or skip questions.
    const realTimePacing = computeRealTimePacing(
      timerSeconds,
      currentTopicIndex,
      zaraQuestionsInCurrentTopic,
      interviewPlan,
      { isGracePeriod }
    );

    // Bug 8 fix: respect the engine's effective hard limit (which already
    // accounts for urgency). This means when the candidate is slow, the limit
    // is REDUCED automatically — not just "suggested" to the LLM and ignored.
    const maxQuestionsHardLimit = Math.max(1, realTimePacing.effectiveHardLimit);
    const mustAdvanceNow = zaraQuestionsInCurrentTopic >= maxQuestionsHardLimit;

    // Interview pace label (from engine)
    const interviewPaceLabel = paceConfig.label;

    // Question style hint for the LLM
    const questionStyleHint = paceConfig.questionStyle === 'concise'
      ? '\nQUESTION STYLE: Ask SHORT, DIRECT questions. No STAR prompts. Example: "¿Cuál es tu experiencia en X?" instead of "Cuéntame sobre una situación en la que tuviste que...". Keep acknowledgments to 2-3 words max.'
      : paceConfig.questionStyle === 'deep'
        ? '\nQUESTION STYLE: You have time for ELABORATE questions. Use STAR prompts, ask for specific examples, probe edge cases, and explore lessons learned. Acknowledgments can be 1-2 sentences.'
        : '';

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
    console.log('Questions in topic:', zaraQuestionsInCurrentTopic, '/', maxQuestionsHardLimit, `(base: ${baseHardLimit}, urgency: ${realTimePacing.urgency})`);
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
    // Bug 3 + 14 fix: do NOT quote the "excellent" criterion as a question template
    // — it causes the model to reformulate the same rubric sentence as every
    // question. Instead, give meta-instructions to vary the angle of exploration.
    const rubricGuidance = currentRubric
      ? `\nEVALUATION GUIDE (internal — DO NOT quote in your questions):
   • You are silently judging the candidate against this topic's rubric.
   • Each question on this topic MUST probe a DIFFERENT angle (e.g. real past example, hypothetical scenario, specific technique, trade-off, failure case, edge case).
   • NEVER ask two questions that share the same verb or framing on the same topic.
   • Score the answer internally as excellent / acceptable / poor based on the rubric you already received in EVALUATION RUBRIC above. Do not narrate this judgment in your response.`
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
    // Bug 4 + 13 fix: do NOT truncate to 100 chars (kills the distinguishing
    // tail of each question) and EXCLUDE non-question messages (greetings,
    // pure transitions). We isolate the actual interrogative sentence(s) per
    // assistant message so the model sees only the questions it has asked.
    const extractQuestion = (content: string): string | null => {
      // Strip control tags
      const clean = content.replace(/\[NEXT_TOPIC\]|\[END_INTERVIEW\]/g, '').trim();
      // Find sentences that end with '?' — those are the actual questions
      const questionSentences = clean.match(/[^.!?¡¿\n]*\?+/g);
      if (!questionSentences || questionSentences.length === 0) return null;
      const joined = questionSentences.map((s) => s.trim()).join(' ').trim();
      return joined.length >= 8 ? joined : null;
    };
    const previousQuestions = recentMessages
      .filter((m: { role: string }) => m.role === 'assistant')
      .map((m: { content: string }) => extractQuestion(m.content))
      .filter((q: string | null): q is string => !!q)
      .map((q: string, i: number) => `  Q${i + 1}: "${q}"`)
      .join('\n') || '  (none yet)';

    // ─── CANDIDATE MEMORY BLOCK (Bug 15 fix) ───
    // Surface 1-3 short, distinctive things the candidate said in earlier topics
    // so Zara can reference them naturally and feel coherent across the session.
    const userTurnsSoFar = recentMessages.filter((m: { role: string; content?: string }) => m.role === 'user' && typeof m.content === 'string');
    type UserMsg = { role: string; content: string };
    const memorableSnippets = (userTurnsSoFar as UserMsg[])
      .map((m) => m.content.trim())
      .filter((t) => t.length >= 60 && t.length <= 320)
      .slice(-4)
      .slice(0, 3);
    const candidateMemoryBlock = memorableSnippets.length > 0
      ? `\n━━━ CANDIDATE MEMORY (use sparingly to reference earlier answers) ━━━\n${memorableSnippets.map((s, i) => `${i + 1}. "${s.length > 200 ? s.substring(0, 200) + '…' : s}"`).join('\n')}`
      : '';

    // ─── TIME STATUS BLOCK ───
    // In grace period, displayed metrics are anchored so the LLM stops seeing
    // alarming "100%+ elapsed / 0 min remaining" signals that previously pushed
    // it to skip questions or close prematurely.
    const displayedPercent = isGracePeriod ? Math.min(85, percentComplete) : percentComplete;
    const displayedRemainingMin = isGracePeriod ? '∞ (grace)' : remainingMinutes;
    const displayedPerTopicMin = isGracePeriod ? '∞ (grace)' : String(minutesPerRemainingTopic);

    const timeStatusBlock = `
━━━ TIME STATUS (REAL-TIME — USE THIS TO PACE YOURSELF) ━━━
⏱ Elapsed: ${elapsedMinutes} min of ${totalMinutes} min planned (${displayedPercent}% of plan)
⏳ Remaining: ${displayedRemainingMin} min
📍 Current Topic: ${currentTopicIndex + 1} of ${totalTopics} ("${currentTopic}")
📊 Topics remaining after this: ${topicsRemaining - 1}
⏰ Available time per remaining topic: ~${displayedPerTopicMin} min
🔢 Questions asked on this topic: ${zaraQuestionsInCurrentTopic} of ${maxQuestionsHardLimit} max (base budget: ${baseHardLimit}, urgency: ${realTimePacing.urgency})
📈 PACING: ${realTimePacing.message}
${isGracePeriod ? '\n🟢 GRACE PERIOD: The interview has exceeded its planned duration but uncovered topics remain. Continue at a natural, unhurried pace — finish the remaining topics with proper questions. Do NOT close the interview yet. Do NOT rush or skip.' : ''}
${isClosingPhase && !isGracePeriod ? '\n🔴 CLOSING PHASE ACTIVE — You are at 90%+ of the interview time AND on the last topic. You MUST wrap up now.' : ''}`;

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

Bug 5 fix — FOCUSED FIRST QUESTION:
- Exactly ONE question, ONE clause. No "and", "y", "or" joining multiple sub-questions.
- Do NOT enumerate multiple concepts in one sentence (e.g. AVOID "Scratch, Python AND electronics for kids 8 AND 14").
- Pick the SINGLE most revealing angle to start. Save the rest for follow-ups.
- Length: under 25 words.
- This is the opening — keep it inviting, not overwhelming.`;
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
    } else if (mustAdvanceNow) {
      // Bug 2 fix: when the budget is exhausted, Zara MUST emit ONLY an
      // acknowledge + clean transition. NO new question on this topic. The
      // first question of the next topic comes in the NEXT turn — after the
      // client advances `currentTopicIndex`. This is what stops the
      // "two-things-at-once" message the candidate sees as confusing.
      phaseInstruction = isLastTopic
        ? `
PHASE: FINAL TOPIC EXHAUSTED → CLOSE
The question budget for the final topic "${currentTopic}" is full (${zaraQuestionsInCurrentTopic}/${maxQuestionsHardLimit}).
You MUST now:
1. Acknowledge the candidate's last answer in ONE short sentence (max 12 words).
2. Deliver a warm professional goodbye, mentioning the evaluation team will follow up.
3. Append [END_INTERVIEW] at the very end.
DO NOT ask any new question. This is the final message.`
        : `
PHASE: TOPIC EXHAUSTED → TRANSITION ONLY
The question budget for "${currentTopic}" is full (${zaraQuestionsInCurrentTopic}/${maxQuestionsHardLimit}).
You MUST now emit a clean transition — NO new question on this topic.
Structure:
1. ONE short sentence acknowledging the candidate's last answer (max 12 words).
2. ONE brief transition sentence announcing the next topic by NAME.
3. Append [NEXT_TOPIC] at the very end.
Example: "Excelente perspectiva. Pasemos ahora a hablar de ${allTopics?.[currentTopicIndex + 1]?.label || 'el siguiente tema'}. [NEXT_TOPIC]"
DO NOT ask any question. The first question of the new topic happens in the next turn.`;
    } else if (isClosingPhase) {
      // Safety fallback — with the new grace-period semantics the client only
      // sets isClosingPhase=true on the last topic. If we somehow land here
      // mid-interview, prefer continuing naturally over forcing a skip.
      phaseInstruction = `
PHASE: CLOSING — STAY THE COURSE
Continue at the planned pace. Ask one focused question on the current topic. Do NOT prematurely transition or close — the timing system will tell you when to wrap up via mustAdvanceNow or the CLOSING phase on the final topic.`;
    } else if (isTransitionToNewTopic) {
      phaseInstruction = `
PHASE: TOPIC TRANSITION (first question of "${currentTopic}")
Brief acknowledgment of the previous topic (max 8 words), then ask your FIRST question about "${currentTopic}".
ONE focused question only — do NOT chain multiple sub-questions with "and"/"y".`;
    } else {
      phaseInstruction = `
PHASE: EXPLORATION
Continue exploring topic "${currentTopic}" with probing follow-ups.
This is question ${zaraQuestionsInCurrentTopic + 1} of ${maxQuestionsHardLimit} on this topic.
${rubricGuidance ? 'Vary the angle from the previous question (see EVALUATION GUIDE above).' : ''}`;
    }

    const isInternalInterview = interviewMode === 'internal';

    const interviewModeBlock = isInternalInterview
      ? `
INTERVIEW MODE: INTERNAL
This is an internal interview or internal mobility conversation.
Adapt your behavior:
- Keep the process lighter, faster and more conversational.
- Do not mention screen sharing, fullscreen, proctoring or hardware verification.
- Assume the candidate may already know the company context.
- Prioritize role readiness, motivation, collaboration, growth potential and concrete examples.
- Still evaluate rigorously using the rubric.
- Mention that the session is being recorded only if naturally relevant, not repeatedly.
`
      : `
INTERVIEW MODE: RESTRICTED
This is a structured external/restricted interview.
Adapt your behavior:
- Keep the interview formal, structured and assessment-oriented.
- Do not apologize for security checks.
- Focus on objective evaluation, consistency and role fit.
`;

    // ─── SYSTEM PROMPT v2.0 ───
    const systemPrompt = `You are Zara, a Senior HR Recruiter at a top-tier corporation conducting a professional structured interview.
You are an EXPERT interviewer trained in behavioral interviewing techniques (STAR method), technical assessment, and candidate evaluation.

YOUR IDENTITY: Professional, warm but focused, efficient. You make candidates feel respected while extracting maximum signal from every answer.

${interviewModeBlock}

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
${candidateMemoryBlock}

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
   • A "question" is one interrogative clause ending in "?". No commas with "and"/"or"/"y"/"o" stacking multiple things to answer.
   • If you find yourself writing two "?" marks, delete the second.

RULE 2 — CONTEXT CONTINUITY: Your question MUST logically follow the candidate's last answer.
Brief acknowledgment (2-8 words), then your new question.

RULE 3 — QUESTION COUNTER (HARD LIMIT — NO EXCEPTIONS):
You have asked ${zaraQuestionsInCurrentTopic} questions on the CURRENT topic "${currentTopic}".
Hard limit for this topic this turn: ${maxQuestionsHardLimit} questions.
${mustAdvanceNow
  ? `⛔ LIMIT REACHED: Emit ONLY the transition (or closing) per the PHASE instruction above.
     ABSOLUTELY DO NOT include a new question for "${currentTopic}" in this response.`
  : `✅ You may ask ${maxQuestionsHardLimit - zaraQuestionsInCurrentTopic} more question(s) on this topic.
     When the hard limit is reached on a future turn, the system will tell you to transition — DO NOT pre-emptively transition while you still have budget.`
}

RULE 4 — NEVER REPEAT QUESTIONS:
Below is the FULL TEXT of every question you have ALREADY asked in this interview. Do NOT ask any of them again — not a rephrased version, not a synonym, not the "same thing from a different angle".
${previousQuestions}

RULE 5 — DEAD END DETECTION:
If the candidate gives 2+ consecutive empty, dismissive, or off-topic answers ("no sé", "tampoco sé", "I don't know", or responses under 5 words),
you MUST immediately output ONLY: ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} — no additional text.

RULE 5b — CONFUSED CANDIDATE:
If the candidate's last message is a single confused word (e.g. "Cómo", "What", "Qué", "huh?") OR a fragment under 6 words that does not answer your last question, you MUST briefly rephrase your previous question more simply BEFORE asking anything new. Do NOT count this turn against the topic budget.

RULE 6 — PACE: ${interviewPaceLabel}${questionStyleHint}
Total: ${totalMinutes} min, ${totalTopics} topics, ~${minutesPerTopic.toFixed(1)} min/topic. Adapt to the candidate's actual response pace.

RULE 7 — LANGUAGE: Respond ONLY in ${lang}. No exceptions.

RULE 8 — TRANSITIONS: [NEXT_TOPIC] is emitted ONLY when the system signals mustAdvanceNow=true (see RULE 3). A transition message is acknowledgment + one transition sentence + [NEXT_TOPIC] — NEVER mixed with a new question.

RULE 9 — PROFESSIONAL CLOSING: When you include [END_INTERVIEW], end with a warm, professional goodbye. Thank the candidate for their time and mention that the team will be in touch.

RULE 10 — VARIETY OF QUESTION ANGLES:
Within the same topic, every question MUST attack a DIFFERENT angle. Rotate through:
   • A concrete past example (STAR)
   • A hypothetical / situational ("what would you do if…")
   • A specific technique or method ("how exactly do you implement X")
   • A trade-off / decision ("when would you choose A over B")
   • A failure case ("describe a time it went wrong")
Never re-use the same opener ("¿Cómo manejarías…?", "¿Cómo mantienes…?") twice on the same topic.`;

    // ─── BUILD INSTRUCTION MESSAGE ───
    const instructionContent = isOpeningPhase
      ? `Deliver the opening greeting and your FIRST question per the OPENING phase instructions above. One focused question only — no multi-part chains.`
      : mustAdvanceNow
        ? (isLastTopic
            ? `The final topic budget is exhausted. Deliver the closing message per RULE 9 and append [END_INTERVIEW]. NO new question.`
            : `The current topic budget is exhausted. Emit ONLY the acknowledge + transition + [NEXT_TOPIC] per the PHASE instruction. NO new question on "${currentTopic}".`)
        : isClosingPhase && isLastTopic
          ? `TIME IS UP. Deliver the closing message and append [END_INTERVIEW].`
          : isClosingPhase
            ? `Continue at the planned pace on "${currentTopic}". The system will tell you when to transition or close — do not pre-empt it.`
            : isTransitionToNewTopic
              ? `Start the new topic "${currentTopic}" with a brief acknowledgment of the previous topic, then ONE focused first question. Do NOT repeat any prior question.`
              : `Ask question #${zaraQuestionsInCurrentTopic + 1} on "${currentTopic}" (max ${maxQuestionsHardLimit} for this topic). One focused question, different angle from prior questions (see RULE 10). Build on the candidate's last answer.`;

    // ─── BUILD MESSAGES ARRAY (Conversational Structure) ───
    // Bug 11 fix: the instruction is sent as a SEPARATE final user message
    // (clearly demarcated) instead of being concatenated onto the candidate's
    // own reply. Two consecutive user messages are accepted by OpenRouter for
    // tool-use-style providers; for strict-alternation models we insert a tiny
    // assistant ack between them so the role sequence stays valid.
    const modelMessages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
    ];

    if (isOpeningPhase && conversationMessages.length === 0) {
      // No conversation yet — add a single user message with the instruction
      modelMessages.push({ role: 'user', content: `[SYSTEM TURN-DIRECTIVE]\n${instructionContent}` });
    } else if (conversationMessages.length > 0) {
      // Push the full prior conversation verbatim
      for (const m of conversationMessages) {
        modelMessages.push({ role: m.role, content: m.content });
      }
      const last = modelMessages[modelMessages.length - 1];
      if (last.role === 'user') {
        // Insert a neutral assistant pivot, then the system directive as user
        modelMessages.push({ role: 'assistant', content: '(processing)' });
      }
      modelMessages.push({ role: 'user', content: `[SYSTEM TURN-DIRECTIVE — this is not from the candidate; act on it now and reply to the candidate]\n${instructionContent}` });
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

    // ─── Server-side timeout on the OpenRouter call ───
    // Prevents the API route from hanging indefinitely if OpenRouter is slow.
    // The client already has a 30s AbortController; this 20s guard fires first
    // so the candidate gets a clean 504 instead of a silent hang.
    const openrouterController = new AbortController();
    const openrouterTimeout = setTimeout(() => openrouterController.abort(), 20000);

    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
          // reasoning removed — adds 3–8s latency per turn with negligible benefit
          // for a real-time live interview. Reserved for async evaluation tasks.
          temperature: 0.7,
          max_tokens: paceConfig.maxTokensHint || 300,
        }),
        signal: openrouterController.signal,
      });
    } catch (fetchErr: unknown) {
      clearTimeout(openrouterTimeout);
      const isAbort = fetchErr instanceof Error && fetchErr.name === 'AbortError';
      if (isAbort) {
        console.error('[chat] OpenRouter fetch timed out after 20s');
        return NextResponse.json(
          { error: 'AI response timeout — please try again' },
          { status: 504 }
        );
      }
      throw fetchErr; // re-throw unexpected errors to the outer try/catch
    } finally {
      clearTimeout(openrouterTimeout);
    }

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
          baseHardLimit,
          currentTopicIndex,
          timerSeconds,
          isClosingPhase,
          isGracePeriod,
          mustAdvanceNow,
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
        baseHardLimit,
        currentTopicIndex,
        topicStartIndex,
        safeTopicStart,
        timerSeconds,
        elapsedMinutes,
        remainingMinutes,
        percentComplete,
        isClosingPhase,
        isGracePeriod,
        isLastTopic,
        isOpeningPhase,
        isTransitionToNewTopic,
        mustAdvanceNow,
        interviewPaceLabel,
        totalTopics,
        totalMinutes,
        minutesPerTopic,
        currentTopic,
        messagesCount: recentMessages?.length || 0,
        enginePlan: {
          usableSeconds: interviewPlan.usableSeconds,
          totalQuestions: interviewPlan.totalQuestions,
          questionStyle: paceConfig.questionStyle,
          topicBudgets: interviewPlan.topics.map(t => ({
            label: t.label,
            budget: t.questionBudget,
            allocatedSec: t.allocatedSeconds,
          })),
        },
        realTimePacing: {
          onTrack: realTimePacing.onTrack,
          urgency: realTimePacing.urgency,
          addQ: realTimePacing.suggestAddQuestions,
          skipQ: realTimePacing.suggestSkipQuestions,
        },
      },
    });
    // ---------------------------------

    console.log('AI RAW Response:', aiMessage.substring(0, 200));
    console.log('====== END CHAT API DEBUG ======\n');

    // Strip any "ZARA:" prefix or instruction echoes the model might prepend
    aiMessage = aiMessage.replace(/^(ZARA\s*(\(Entrevistadora\))?\s*:\s*)/i, '').trim();
    aiMessage = aiMessage.replace(/^\[INSTRUCTION[^\]]*\].*?\n/i, '').trim();
    aiMessage = aiMessage.replace(/^\[SYSTEM INSTRUCTION[^\]]*\].*?\n/i, '').trim();

    // ===== Sentiment Analysis — fire-and-forget (non-blocking) =====
    // Sentiment runs in the background; we no longer await it before replying
    // to the candidate. This removes 1–3s of extra latency per turn.
    // NOTE: sentiment will be null in the frontend response. Admin-side display
    // of confidence/evasion signals is a known temporary loss until a background
    // persistence path is added (store to telemetry by sessionId + turnIndex).
    if (sentimentPromise) {
      sentimentPromise.catch((err) => {
        console.error('[Sentiment] Background error:', err);
      });
    }

    return NextResponse.json({ message: aiMessage, sentiment: null });
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
