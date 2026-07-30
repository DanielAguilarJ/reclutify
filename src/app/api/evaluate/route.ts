import { NextResponse, type NextRequest } from 'next/server';

import { ApiError, handleApiError } from '@/lib/api/errors';
import { requireInterviewAccess } from '@/lib/api/interview-access';
import { chatCompletion, type OpenRouterMessage } from '@/lib/api/openrouter';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  resolveOrgNotificationRecipient,
  sendRecruiterInterviewNotification,
} from '@/lib/api/recruiter-notification';
import { evaluateRequestSchema, type InterviewTopicInput } from '@/lib/schemas/interview';
import { INTERVIEW_EVALUATION_MODEL } from '@/lib/ai-model';

/**
 * POST /api/evaluate — evaluación final del candidato a partir de la transcripción.
 *
 * QUÉ ESTABA MAL
 * --------------
 * 1. **SSRF con exfiltración.** Al terminar, la ruta avisaba al reclutador así:
 *
 *        const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || '...';
 *        await fetch(`${origin}/api/notifications`, { method: 'POST', body: JSON.stringify({...}) });
 *
 *    `Origin` la controla quien llama. Con `Origin: https://atacante.example` el
 *    servidor enviaba a ese host el nombre del candidato, su puntuación y la
 *    recomendación de contratación. Ahora se llama a la función en el mismo
 *    proceso: no hay petición HTTP que desviar.
 *
 * 2. **Sin autorización.** Cualquiera podía inventar una transcripción y obtener
 *    una evaluación con cargo al saldo de OpenRouter. Peor: `/admin/pipeline`
 *    guarda el resultado, así que era el primer paso para inyectar evaluaciones
 *    falsas.
 *
 * 3. **`POST {}` reventaba con 500.** `topics.map(...)` sin comprobar que
 *    `topics` fuera un array.
 *
 * 4. **Destinatario incrustado.** El aviso iba a `'recruiter@reclutify.com'`, una
 *    dirección del proveedor, no del cliente. Ahora se resuelve el `owner` de la
 *    organización que la credencial acredita.
 *
 * QUÉ SE CONSERVA
 * ---------------
 * El prompt, el esquema JSON de salida, el recálculo de la puntuación ponderada
 * en el servidor y los umbrales de recomendación son los mismos. Este cambio es
 * de seguridad y robustez, no de criterio de evaluación.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Rúbrica normalizada de un criterio. */
interface NormalizedRubric {
  weight: number;
  excellent: string;
  acceptable: string;
  poor: string;
}

/**
 * Completa la rúbrica de un criterio con valores por defecto.
 *
 * Misma lógica que tenía la ruta: un criterio sin rúbrica sigue siendo evaluable
 * con descriptores genéricos, en vez de quedar fuera de la evaluación.
 */
function ensureRubric(topic: InterviewTopicInput): NormalizedRubric {
  const rubric = topic.rubric;

  return {
    weight: rubric?.weight ?? 5,
    excellent: rubric?.excellent?.trim() || `Dominio sobresaliente en ${topic.label}`,
    acceptable: rubric?.acceptable?.trim() || `Conocimiento funcional en ${topic.label}`,
    poor: rubric?.poor?.trim() || `Carencias notables en ${topic.label}`,
  };
}

/** Bloque de rúbrica ponderada que se inyecta en el prompt. */
function buildRubricContext(topics: InterviewTopicInput[]): string {
  const criteria = topics
    .map((topic) => {
      const rubric = ensureRubric(topic);
      return `📋 "${topic.label}" (weight: ${rubric.weight}/10)
   • Excellent (9-10): ${rubric.excellent}
   • Acceptable (6-8): ${rubric.acceptable}
   • Poor (0-5): ${rubric.poor}`;
    })
    .join('\n\n');

  return `\n\nWEIGHTED EVALUATION RUBRIC:
Use the following criteria to score each topic. The weight indicates importance — higher weight = more impact on overallScore.

${criteria}

SCORING RULES:
- Score each topic 0-10 based on the criteria above
- Calculate overallScore as a WEIGHTED AVERAGE: sum(score × weight) / sum(weights) × 10
- A topic with weight 9 counts 3x more than one with weight 3
- recommendation thresholds: >=80 = "Strong Hire", >=60 = "Hire", <60 = "Pass"`;
}

/**
 * Renderiza la transcripción como conversación legible, etiquetando cada turno
 * con el tema al que pertenece.
 *
 * Se conserva tal cual de la versión anterior: pasar el JSON crudo gastaba tokens
 * en marcas de tiempo y cargas de sentimiento, y obligaba al modelo a
 * reconstruir la estructura de turnos que aquí se le da hecha.
 */
function renderTranscript(
  transcript: { role?: string; content?: string }[],
  topicLabels: string[],
): string {
  const transitionRegex =
    /pasemos al siguiente tema|let's move on to the next topic|let's move on to|avancemos al siguiente tema|ahora hablemos sobre|pasemos ahora a|with that we've covered|with that we have covered/i;

  let topicCursor = 0;

  return transcript
    .map((entry) => {
      const speaker = entry.role === 'assistant' ? 'ZARA' : 'CANDIDATE';
      const rawContent = entry.content ?? '';
      const content = rawContent.replace(/\[NEXT_TOPIC\]|\[END_INTERVIEW\]/g, '').trim();
      const currentTopic = topicLabels[topicCursor] || 'general';

      // El cursor avanza DESPUÉS de registrar el turno: el mensaje que anuncia la
      // transición pertenece al tema que se está cerrando.
      if (
        entry.role === 'assistant' &&
        (rawContent.includes('[NEXT_TOPIC]') || transitionRegex.test(rawContent))
      ) {
        topicCursor = Math.min(Math.max(0, topicLabels.length - 1), topicCursor + 1);
      }

      return `[topic: ${currentTopic}] ${speaker}: ${content}`;
    })
    .join('\n\n');
}

/** Evaluación tal como la devuelve el modelo, antes de recalcular la puntuación. */
interface RawEvaluation {
  candidateName?: string;
  overallScore?: number;
  recommendation?: string;
  topicScores?: Record<string, number>;
  [key: string]: unknown;
}

/**
 * Recalcula `overallScore` y `recommendation` en el SERVIDOR.
 *
 * El modelo también los produce, pero no se le hace caso: la media ponderada es
 * aritmética y un modelo de lenguaje la aproxima. Es la puntuación con la que se
 * decide una contratación, así que la calcula código determinista a partir de las
 * puntuaciones por criterio y de los pesos que fijó el reclutador.
 */
function applyWeightedScore(
  evaluation: RawEvaluation,
  topics: InterviewTopicInput[],
): RawEvaluation {
  const topicScores = evaluation.topicScores;

  if (!topicScores || typeof topicScores !== 'object' || topics.length === 0) {
    return evaluation;
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const topic of topics) {
    const rubric = ensureRubric(topic);
    const rawScore = topicScores[topic.label];
    const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : 0;

    weightedSum += score * rubric.weight;
    totalWeight += rubric.weight;
  }

  if (totalWeight <= 0) return evaluation;

  const overallScore = Math.min(100, Math.max(0, Math.round((weightedSum / totalWeight) * 10)));

  return {
    ...evaluation,
    overallScore,
    recommendation:
      overallScore >= 80 ? 'Strong Hire' : overallScore >= 60 ? 'Hire' : 'Pass',
  };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = evaluateRequestSchema.parse(rawBody);

    const access = await requireInterviewAccess(rawBody, body.roleId);

    // Una evaluación por entrevista es lo normal, con hasta 3 reintentos del
    // cliente (`InterviewComplete`). El tope por hora corta el bucle sin
    // estorbar al reclutador que reevalúa varios candidatos seguidos.
    await enforceRateLimit(req, RATE_LIMITS.AI_EVALUATE, access.userId ?? access.orgId);

    const topicLabels = body.topics.map((topic) => topic.label);

    const systemPrompt = `You are an expert HR Evaluator. Analyze the following interview transcript for candidate "${body.candidateName}".
Your objective is to honestly and critically evaluate if the candidate is suitable for the role:
**Role Title:** ${body.roleTitle || 'Candidate'}
**Role Description:** ${body.roleDescription}

The interview covered these topics: ${topicLabels.join(', ')}.${buildRubricContext(body.topics)}

Output a strict JSON object evaluating the candidate with this exact schema:
{
  "candidateName": "${body.candidateName}",
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
- "onboardingTips": List 2-3 specific onboarding suggestions based on the candidate's weaker areas.
- "biasFlags": IMPORTANT — Review your own evaluation for potential bias. Check if any of your scoring or commentary could be influenced by:
  • Linguistic patterns (accent indicators, non-native speech patterns in text)
  • Gender assumptions from name or pronouns
  • Cultural/nationality references in the transcript
  • Age-related assumptions
  • Religious references
  If you detect potential bias in YOUR evaluation, add a flag: { "type": "linguistic_bias|gender_bias|cultural_bias|age_bias", "description": "explanation of the potential bias", "severity": "low|medium|high" }
  If no bias is detected, return an empty array [].

Be brutally honest, fair, and objective. Base your evaluation solely on demonstrated knowledge in the transcript and how strictly it aligns with the role description${body.topics.some((topic) => topic.rubric) ? ' and the weighted rubric criteria above' : ''}.
Return ONLY the JSON object, no markdown formatting.
CRITICAL MANDATE: The output JSON values (especially pros, cons, executiveSummary, interviewHighlights quotes, hiringRisks, onboardingTips, biasFlags description) MUST be written in ${body.language === 'es' ? 'Spanish (Español)' : 'English'}. The JSON keys must remain exactly as specified in English.`;

    const messages: OpenRouterMessage[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Below is the full interview transcript. Each turn is tagged with the topic it was discussed under.

${renderTranscript(body.transcript, topicLabels) || '(empty transcript)'}

Now produce the evaluation JSON exactly as specified in the system message. Use ONLY evidence from the transcript above. Match topicScores keys to the topic labels exactly.`,
      },
    ];

    const completion = await chatCompletion({
      model: INTERVIEW_EVALUATION_MODEL,
      messages,
      temperature: 0.2,
      jsonMode: true,
      timeoutMs: 45_000,
      title: 'Reclutify AI Interviewer',
      // Si el candidato cierra la pestaña, no hay a quién entregar el resultado:
      // se aborta la llamada en vez de pagarla completa.
      signal: req.signal,
    });

    const parsed = completion.parseJson<RawEvaluation>();

    if (!parsed) {
      throw ApiError.upstream('The evaluation service returned an unreadable response');
    }

    const evaluation = applyWeightedScore(parsed, body.topics);

    // ─── Aviso al reclutador ───
    // Accesorio por definición: la evaluación ya está calculada. Un fallo aquí no
    // puede propagarse a la respuesta del candidato, así que se registra y sigue.
    const recipient = await resolveOrgNotificationRecipient(access.orgId);

    if (recipient) {
      const notification = await sendRecruiterInterviewNotification({
        emailTo: recipient,
        candidateName: typeof evaluation.candidateName === 'string' ? evaluation.candidateName : body.candidateName,
        roleTitle: body.roleTitle || 'Vacante',
        score: typeof evaluation.overallScore === 'number' ? evaluation.overallScore : null,
        recommendation: typeof evaluation.recommendation === 'string' ? evaluation.recommendation : '',
        reportPath: '/admin/pipeline',
      });

      if (!notification.sent) {
        console.warn(`[evaluate] recruiter notification skipped: ${notification.reason}`);
      }
    } else {
      console.warn(`[evaluate] no notification recipient for org=${access.orgId}`);
    }

    return NextResponse.json({ evaluation });
  } catch (error) {
    return handleApiError(error, '[evaluate]');
  }
}
