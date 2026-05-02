/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { currentTopic, allTopics, recentMessages, language, roleTitle, roleDescription, isLastTopic, interviewDuration, cvData, candidateName } = await req.json();

    // Calcular tiempo por tema según la duración configurada
    const totalTopics = allTopics?.length || 1;
    const totalMinutes = typeof interviewDuration === 'number' && interviewDuration > 0
      ? interviewDuration
      : 30;
    const minutesPerTopic = totalTopics > 0
      ? parseFloat((totalMinutes / totalTopics).toFixed(2))
      : totalMinutes;

    // Adaptive question budget: scales with actual time per topic
    // < 1 min  → 1-2  (e.g. 5 min / 6 topics = 0.83 min)
    // 1-2 min  → 1-3  (e.g. 10 min / 6 topics = 1.67 min)
    // 2-4 min  → 2-3  (e.g. 15 min / 6 topics = 2.5 min)
    // 4-7 min  → 3-5  (e.g. 30 min / 6 topics = 5 min)
    // > 7 min  → 4-7  (e.g. 60 min / 6 topics = 10 min)
    const questionsRange =
      minutesPerTopic < 1   ? '1-2'
      : minutesPerTopic < 2 ? '1-3'
      : minutesPerTopic < 4 ? '2-3'
      : minutesPerTopic < 7 ? '3-5'
      : '4-7';

    // Adaptive pacing instruction that matches the configured duration
    const interviewPaceLabel =
      totalMinutes <= 7
        ? 'VERY SHORT INTERVIEW: Be extremely concise. Ask only the single most important question per topic. No pleasantries whatsoever.'
        : totalMinutes <= 15
          ? 'SHORT INTERVIEW: Be concise and direct. Skip pleasantries. Go straight to key questions.'
          : totalMinutes <= 35
            ? 'STANDARD INTERVIEW: Balance depth with pace.'
            : totalMinutes <= 55
              ? 'LONG INTERVIEW: You have time to explore deeply. Ask follow-up questions and dig into examples.'
              : 'VERY LONG INTERVIEW: Explore topics thoroughly. Dig into edge cases, examples, and lessons learned.';

    // ─── Bug Fix #1: Counter of REAL Zara questions in the current topic ───
    const zaraQuestionsInCurrentTopic = recentMessages.filter(
      (m: { role: string; content: string }) =>
        m.role === 'assistant' &&
        !m.content.includes('[NEXT_TOPIC]') &&
        !m.content.includes('[END_INTERVIEW]')
    ).length;

    // Hard limit per topic (never exceed)
    const maxQuestionsHardLimit =
      minutesPerTopic < 2 ? 2 :
      minutesPerTopic < 4 ? 3 :
      minutesPerTopic < 7 ? 5 : 7;

    const mustAdvanceNow = zaraQuestionsInCurrentTopic >= maxQuestionsHardLimit;
    const isOnLastQuestionOfTopic = zaraQuestionsInCurrentTopic === maxQuestionsHardLimit - 1;


    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    const lang = language === 'es' ? 'Spanish (Español)' : 'English';

    console.log('\n====== CHAT API DEBUG ======');
    console.log('Topic:', currentTopic);
    console.log('Role:', roleTitle);
    console.log('Language:', language);
    console.log('Messages count:', recentMessages.length);
    console.log('CV Data present:', !!cvData);

    // ─── Helper: ensure every topic has a rubric (fallback if missing/empty) ───
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

        // Rubric-aware depth guidance
        let depthHint = '';
        if (rubric.weight >= 8) {
          depthHint = ' [DEEP DIVE — ask 3+ questions, this is critical]';
        } else if (rubric.weight <= 3) {
          depthHint = ' [QUICK — ask 1-2 questions max]';
        }

        let criteriaHint = '';
        if (t.status === 'current') {
          criteriaHint = `\n      → Evaluate if candidate can: "${rubric.excellent}"`;
        }

        return `  ${i + 1}. ${icon} ${t.label} (Weight: ${rubric.weight}/10)${depthHint} [${t.status}]${criteriaHint}`;
      }).join('\n')
      : `  - ${currentTopic}`;

    // ─── BLOQUE 4: Rúbrica completa por criterio (NEVER empty) ───
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

    // Build the conversation as a formatted transcript inside a SINGLE user message.
    const conversationLines = recentMessages.map((m: { role: string; content: string }) => {
      if (m.role === 'assistant') {
        return `ZARA (Entrevistadora): ${m.content}`;
      } else {
        return `CANDIDATO: ${m.content}`;
      }
    }).join('\n\n');

    // Get current topic rubric for enhanced guidance
    const currentTopicData = allTopics?.find((t: { label: string; status: string }) => t.label === currentTopic);
    const currentRubric = currentTopicData ? ensureRubric(currentTopicData) : null;
    const rubricGuidance = currentRubric
      ? `\nEVALUATION GUIDE FOR CURRENT TOPIC: You want to discover if the candidate demonstrates: "${currentRubric.excellent}". An acceptable candidate would show: "${currentRubric.acceptable}". A weak candidate would show: "${currentRubric.poor}". Ask questions that reveal which level the candidate is at.`
      : '';

    // Build CV profile section for the system prompt (only if CV was uploaded)
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

    const systemPrompt = `You are Zara, a Senior HR Recruiter conducting a live structured job interview.

YOUR ONLY JOB: Ask interview questions and evaluate answers. You are NEVER the candidate.

JOB INFO:
- Title: ${roleTitle}
- Description: ${roleDescription}
${cvProfileSection}

INTERVIEW TOPICS (in order):
${topicList}

EVALUATION RUBRIC:
${rubricBlock || '  No specific rubric — evaluate general competence.'}

CURRENT TOPIC: ${currentTopic}${rubricGuidance}
${cvVerificationInstructions}

━━━ STRICT RULES (FOLLOW EXACTLY) ━━━

RULE 1 — ONE QUESTION ONLY: Ask exactly ONE question per response. Never list multiple questions.

RULE 2 — CONTEXT CONTINUITY: Your question MUST logically follow the candidate's last answer. 
Brief acknowledgment (max 5 words), then your new question.

RULE 3 — QUESTION COUNTER (CRITICAL — NO EXCEPTIONS):
You have asked ${zaraQuestionsInCurrentTopic} questions on the CURRENT topic "${currentTopic}".
Maximum allowed for this topic: ${maxQuestionsHardLimit} questions.
Questions remaining for this topic: ${maxQuestionsHardLimit - zaraQuestionsInCurrentTopic}.
${mustAdvanceNow
  ? `⛔ LIMIT REACHED: You have asked the maximum ${maxQuestionsHardLimit} questions on "${currentTopic}". 
     You MUST ${isLastTopic ? 'close the interview now with a goodbye and append [END_INTERVIEW]' : 'transition immediately to the next topic and append [NEXT_TOPIC]'}. 
     DO NOT ask another question on this topic.`
  : isOnLastQuestionOfTopic
    ? `⚠️ FINAL QUESTION for this topic: This is your last allowed question on "${currentTopic}". 
       After asking it, append ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} at the end.`
    : `✅ You may ask ${maxQuestionsHardLimit - zaraQuestionsInCurrentTopic} more question(s) on this topic.`
}

RULE 4 — NEVER REPEAT QUESTIONS: 
The following topics/questions have ALREADY been asked — DO NOT ask about them again in any form:
${recentMessages
  .filter((m: { role: string }) => m.role === 'assistant')
  .map((m: { content: string }, i: number) => `  Q${i + 1}: "${m.content.substring(0, 80)}..."`)
  .join('\n') || '  (none yet)'}

RULE 5 — DEAD END DETECTION:
Count the candidate's last consecutive answers. If 2+ consecutive answers are empty, dismissive, 
or off-topic ("no sé", "ya me preguntaste", "tampoco sé", "I don't know", incomplete sentence < 5 words), 
you MUST immediately output ONLY: ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} — no additional text.

RULE 6 — PACE: ${interviewPaceLabel}. Total: ${totalMinutes} min, ${totalTopics} topics, ~${minutesPerTopic.toFixed(1)} min/topic.

RULE 7 — LANGUAGE: Respond ONLY in ${lang}. No exceptions.`;

    const userMessage = `INTERVIEW TRANSCRIPT:
${conversationLines}

---
INSTRUCTION FOR ZARA:
${mustAdvanceNow
  ? `You have reached the question limit for topic "${currentTopic}" (${zaraQuestionsInCurrentTopic}/${maxQuestionsHardLimit} questions asked). 
     ${isLastTopic 
       ? 'Say a brief professional goodbye (max 15 words) and append [END_INTERVIEW].' 
       : 'Write one transition sentence (max 10 words) and append [NEXT_TOPIC].'}`
  : `Ask question #${zaraQuestionsInCurrentTopic + 1} of max ${maxQuestionsHardLimit} about "${currentTopic}". 
     DO NOT repeat any question already asked (see Rule 4). 
     ${isOnLastQuestionOfTopic ? `This is your LAST question for this topic — append ${isLastTopic ? '[END_INTERVIEW]' : '[NEXT_TOPIC]'} at the end.` : ''}
     Base your question on the candidate's last answer. One question only.`
}`;


    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify AI Interviewer',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      }),
    });

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

    console.log('AI RAW Response:', aiMessage.substring(0, 200));
    console.log('====== END CHAT API DEBUG ======\n');

    // Strip any "ZARA:" prefix the model might prepend
    aiMessage = aiMessage.replace(/^(ZARA\s*(\(Entrevistadora\))?\s*:\s*)/i, '').trim();

    // ===== Module 5: Sentiment Analysis =====
    // Get the candidate's last message for analysis
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
            model: 'google/gemini-3-flash-preview',
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
