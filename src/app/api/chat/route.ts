/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { currentTopic, allTopics, recentMessages, language, roleTitle, roleDescription, isLastTopic } = await req.json();


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

    // Build topic list with status indicators AND rubric-aware depth hints
    const topicList = allTopics
      ? allTopics.map((t: { label: string; status: string; rubric?: { weight: number; excellent: string; acceptable: string; poor: string } }, i: number) => {
        const icon = t.status === 'completed' ? '✅' : t.status === 'current' ? '👉' : '⏳';

        // Rubric-aware depth guidance
        let depthHint = '';
        let criteriaHint = '';
        if (t.rubric) {
          if (t.rubric.weight >= 8) {
            depthHint = ' [DEEP DIVE — ask 3+ questions, this is critical]';
          } else if (t.rubric.weight <= 3) {
            depthHint = ' [QUICK — ask 1-2 questions max]';
          }
          if (t.status === 'current' && t.rubric.excellent) {
            criteriaHint = `\n      → Evaluate if candidate can: "${t.rubric.excellent}"`;
          }
        }

        return `  ${i + 1}. ${icon} ${t.label}${depthHint} [${t.status}]${criteriaHint}`;
      }).join('\n')
      : `  - ${currentTopic}`;

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
    const rubricGuidance = currentTopicData?.rubric
      ? `\nEVALUATION GUIDE FOR CURRENT TOPIC: You want to discover if the candidate demonstrates: "${currentTopicData.rubric.excellent}". Ask questions that reveal this level of competence. A weak candidate would show: "${currentTopicData.rubric.poor}".`
      : '';

    const systemPrompt = `You are Zara, a Senior HR Recruiter. You are conducting a live job interview.

YOUR ONLY JOB: Ask interview questions. Evaluate the candidate's answers. Ask follow-up questions.

YOU MUST NEVER: Answer questions yourself. Describe your own experience. Speak as if you are applying for a job. Generate text that sounds like a job candidate.

JOB INFO:
- Title: ${roleTitle}
- Description: ${roleDescription}

INTERVIEW TOPICS (in order):
${topicList}

CURRENT TOPIC: ${currentTopic}${rubricGuidance}

RULES:
1. Read the transcript below. The last message is from the CANDIDATE. You must respond as ZARA THE INTERVIEWER with a follow-up question or a new question.
2. CONTEXT CONTINUITY: Your next question MUST follow logically from the candidate's last answer. Acknowledge what they said briefly, then ask a deeper or related question.
3. TOPIC PROGRESSION: You have a LIMITED time interview. ${isLastTopic
        ? 'This is the FINAL topic of the interview. After 2-3 exchanges on this topic, you MUST conclude the interview. Offer your final closing remarks, thank the candidate for their time, and append "[END_INTERVIEW]" at the very end of your response.'
        : 'After 2-3 exchanges on the current topic, you MUST move to the next topic. Append "[NEXT_TOPIC]" at the very end of your response when ready to advance. Check the topic list above — do NOT stay too long on completed topics.'
      }
4. Keep responses well under 50 words. Be conversational and natural.
5. EXTREMELY IMPORTANT: Respond ONLY in ${lang}. DO NOT USE ANY OTHER LANGUAGE.
6. EXTREMELY IMPORTANT: Ask EXACTLY ONE question at a time. DO NOT give a list of questions, and DO NOT reveal upcoming questions.`;


    const userMessage = `Here is the full interview transcript so far:

${conversationLines}

---
Now respond as ZARA THE INTERVIEWER. Ask the candidate a follow-up question or a new question about "${currentTopic}". Remember: you are the INTERVIEWER, NOT the candidate. DO NOT answer questions. Only ASK them. ${isLastTopic
        ? 'If you have asked 2-3 questions on this final topic, conclude the interview by saying goodbye and appending [END_INTERVIEW].'
        : 'If you have asked 2-3 questions on this topic already, transition to the next one by appending [NEXT_TOPIC].'
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
