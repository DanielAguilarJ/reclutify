import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { transcript, topics, candidateName, language, roleTitle, roleDescription } = await req.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 500 }
      );
    }

    // ─── Helper: ensure every topic has a rubric (fallback if missing/empty) ───
    const ensureRubric = (t: { label: string; rubric?: { weight?: number; excellent?: string; acceptable?: string; poor?: string } }) => {
      const r = t.rubric;
      const weight = r?.weight ?? 5;
      const excellent = (r?.excellent && r.excellent.trim()) || `Dominio sobresaliente en ${t.label}`;
      const acceptable = (r?.acceptable && r.acceptable.trim()) || `Conocimiento funcional en ${t.label}`;
      const poor = (r?.poor && r.poor.trim()) || `Carencias notables en ${t.label}`;
      return { weight, excellent, acceptable, poor };
    };

    // Build weighted rubric context — ALWAYS include rubric (with fallback)
    const rubricContext = `\n\nWEIGHTED EVALUATION RUBRIC:
Use the following criteria to score each topic. The weight indicates importance — higher weight = more impact on overallScore.

${topics.map((t: { label: string; rubric?: { weight: number; excellent: string; acceptable: string; poor: string } }) => {
      const rubric = ensureRubric(t);
      return `📋 "${t.label}" (weight: ${rubric.weight}/10)
   • Excellent (9-10): ${rubric.excellent}
   • Acceptable (6-8): ${rubric.acceptable}
   • Poor (0-5): ${rubric.poor}`;
    }).join('\n\n')}

SCORING RULES:
- Score each topic 0-10 based on the criteria above
- Calculate overallScore as a WEIGHTED AVERAGE: sum(score × weight) / sum(weights) × 10
- A topic with weight 9 counts 3x more than one with weight 3
- recommendation thresholds: >=80 = "Strong Hire", >=60 = "Hire", <60 = "Pass"`;

    const topicList = topics.map((t: { label: string }) => t.label).join(', ');
    const hasRubrics = topics.some((t: { rubric?: unknown }) => t.rubric);

    const systemPrompt = `You are an expert HR Evaluator. Analyze the following interview transcript for candidate "${candidateName}".
Your objective is to honestly and critically evaluate if the candidate is suitable for the role:
**Role Title:** ${roleTitle || 'Candidate'}
**Role Description:** ${roleDescription || ''}

The interview covered these topics: ${topicList}.${rubricContext}

Output a strict JSON object evaluating the candidate with this exact schema:
{
  "candidateName": "${candidateName}",
  "overallScore": <number 0-100>,
  "recommendation": "<one of: Strong Hire | Hire | Pass>",
  "pros": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "cons": ["<weakness 1>", "<weakness 2>", "<weakness 3>"],
  "topicScores": { "<topic name>": <score 0-10>, ... },
  "executiveSummary": "<A 3-4 sentence holistic paragraph describing the candidate's overall performance, key strengths, notable gaps, and whether they would be a good cultural and technical fit for the role. Write it as if briefing a hiring manager.>",
  "interviewHighlights": [
    { "quote": "<exact or paraphrased notable response from transcript>", "topic": "<topic name>", "significance": "positive" },
    { "quote": "<exact or paraphrased weak response from transcript>", "topic": "<topic name>", "significance": "negative" }
  ],
  "hiringRisks": ["<specific risk if hired, e.g. 'Limited experience with X could slow onboarding'>"],
  "onboardingTips": ["<actionable suggestion e.g. 'Pair with senior mentor for first 30 days on X'>", "<another tip>"],
  "biasFlags": []
}

FIELD INSTRUCTIONS:
- "executiveSummary": Write 3-4 sentences as a professional HR briefing. Be specific about the candidate.
- "interviewHighlights": Pick 2-3 of the most notable responses (best AND worst). Include the actual quote or close paraphrase from the transcript. Each must reference a specific topic.
- "hiringRisks": List 0-2 concrete risks if this candidate is hired. Base these on gaps observed in the transcript, NOT speculation. If no risks, return empty array.
- "onboardingTips": List 2-3 specific onboarding suggestions based on the candidate's weaker areas. E.g. "Provide training on X" or "Assign gradually increasing responsibilities in Y".
- "biasFlags": IMPORTANT — Review your own evaluation for potential bias. Check if any of your scoring or commentary could be influenced by:
  • Linguistic patterns (accent indicators, non-native speech patterns in text)
  • Gender assumptions from name or pronouns
  • Cultural/nationality references in the transcript
  • Age-related assumptions
  • Religious references
  If you detect potential bias in YOUR evaluation, add a flag: { "type": "linguistic_bias|gender_bias|cultural_bias|age_bias", "description": "explanation of the potential bias", "severity": "low|medium|high" }
  If no bias is detected, return an empty array [].

Be brutally honest, fair, and objective. Base your evaluation solely on demonstrated knowledge in the transcript and how strictly it aligns with the role description${hasRubrics ? ' and the weighted rubric criteria above' : ''}.
Return ONLY the JSON object, no markdown formatting.
CRITICAL MANDATE: The output JSON values (especially pros, cons, executiveSummary, interviewHighlights quotes, hiringRisks, onboardingTips, biasFlags description) MUST be written in ${language === 'es' ? 'Spanish (Español)' : 'English'}. The JSON keys must remain exactly as specified in English.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify AI Interviewer',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash:exacto',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analyze the following interview transcript and generate the evaluation JSON report:\n\n${JSON.stringify(transcript)}` }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter evaluation error:', errorData);
      return NextResponse.json(
        { error: 'Failed to evaluate candidate' },
        { status: 500 }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse the JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: 'Failed to parse evaluation JSON' },
        { status: 500 }
      );
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // ─── Server-side weighted score recalculation ───
    // The AI provides topicScores; we recalculate overallScore with exact weighted average
    if (evaluation.topicScores && typeof evaluation.topicScores === 'object') {
      let weightedSum = 0;
      let totalWeight = 0;

      for (const t of topics as { label: string; rubric?: { weight?: number } }[]) {
        const rubric = ensureRubric(t);
        const score = evaluation.topicScores[t.label] ?? 0;
        weightedSum += score * rubric.weight;
        totalWeight += rubric.weight;
      }

      if (totalWeight > 0) {
        // Weighted average on 0-10 scale, then multiply by 10 for 0-100
        const weightedScore = Math.round((weightedSum / totalWeight) * 10);
        evaluation.overallScore = Math.min(100, Math.max(0, weightedScore));

        // Recalculate recommendation based on weighted score
        if (evaluation.overallScore >= 80) {
          evaluation.recommendation = 'Strong Hire';
        } else if (evaluation.overallScore >= 60) {
          evaluation.recommendation = 'Hire';
        } else {
          evaluation.recommendation = 'Pass';
        }
      }
    }

    // Priority 5: Envío de correo automáticamente al reclutador (Notificación)
    try {
      const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      await fetch(`${origin}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailTo: 'recruiter@reclutify.com', 
          candidateName: evaluation.candidateName,
          roleTitle: roleTitle || 'Vacante',
          score: evaluation.overallScore,
          recommendation: evaluation.recommendation,
          reportUrl: `${origin}/admin/pipeline`
        })
      });
    } catch(e) {
      console.warn("Fallo silencioso en notificación:", e);
    }

    return NextResponse.json({ evaluation });
  } catch (error) {
    console.error('Evaluate API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
