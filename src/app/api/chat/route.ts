import { NextResponse, type NextRequest } from 'next/server';

import { INTERVIEW_CHAT_MODEL } from '@/lib/ai-model';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { requireInterviewAccess } from '@/lib/api/interview-access';
import { chatCompletion } from '@/lib/api/openrouter';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  logInterviewTurn,
  summarizeChatPayload,
  type TelemetryTurn,
} from '@/lib/interview/telemetry';
import {
  buildModelMessages,
  buildTurnDirective,
  buildZaraSystemPrompt,
  deriveTurnState,
  ensureRubric,
  hasUsableCv,
  resolvePhase,
  stripModelArtifacts,
  type TimeMetrics,
} from '@/lib/interview/zara-prompt';
import {
  computeInterviewPlan,
  computeRealTimePacing,
  getQuestionBudget,
} from '@/lib/interviewTimingEngine';
import { chatRequestSchema, type ChatRequest } from '@/lib/schemas/interview';

/**
 * POST /api/chat — un turno de la entrevista con Zara.
 *
 * Es el endpoint más importante del producto y el que estaba peor protegido.
 *
 * QUÉ ESTABA MAL
 * --------------
 * 1. **Sin autenticación ni autorización.** Cualquiera podía llamarlo en bucle.
 *    Cada llamada envía el prompt completo (rúbrica + CV + historial) a un modelo
 *    que factura por token, así que era un grifo abierto al saldo de OpenRouter.
 *
 * 2. **Sin límite de tasa.** Ninguno, en ningún endpoint del proyecto.
 *
 * 3. **Sin validación.** `POST {}` devolvía `500`: el manejador hacía
 *    `Math.min(topicStartIndex, recentMessages.length)` sobre `undefined`. Y
 *    `roleTitle`, `roleDescription`, `candidateName` y `cvData` se interpolaban en
 *    el prompt de sistema sin tope, así que quien llamaba controlaba el prompt
 *    entero y su tamaño.
 *
 * 4. **Diez `console.log` de depuración** que volcaban tema, puesto, temporizador
 *    y los primeros 200 caracteres de la respuesta del modelo en cada turno.
 *
 * 5. **Telemetría con datos personales y promesa flotante.** `raw_payload`
 *    guardaba `{ ...rawBody }`, es decir el CV completo, en una tabla que era
 *    legible por cualquier cuenta autenticada. Y se llamaba sin `await`, así que
 *    en serverless se perdía justo en los turnos lentos.
 *
 * 6. **Sin propagar la cancelación.** Si el candidato cerraba la pestaña, la
 *    llamada al modelo se pagaba completa.
 *
 * 7. **939 líneas en un solo `try`**, con la construcción del prompt, el conteo de
 *    preguntas, la telemetría y dos llamadas a OpenRouter entrelazadas.
 *
 * QUÉ SE CONSERVA
 * ---------------
 * El prompt, el motor de tiempos, el presupuesto de preguntas, la detección de
 * fase y las etiquetas de control `[NEXT_TOPIC]` / `[END_INTERVIEW]` son los
 * mismos. La construcción del texto está en `src/lib/interview/zara-prompt.ts`
 * palabra por palabra. Este cambio es de seguridad, robustez y estructura, no de
 * comportamiento de la entrevistadora.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Tope de tiempo de la llamada al modelo. El mismo que ya aplicaba la ruta. */
const MODEL_TIMEOUT_MS = 20_000;

/** Calcula las métricas de tiempo que consumen el prompt y la telemetría. */
function computeTimeMetrics(request: ChatRequest, totalTopics: number): TimeMetrics {
  const totalMinutes = request.interviewDuration;
  const totalSeconds = totalMinutes * 60;
  const remainingSeconds = Math.max(0, totalSeconds - request.timerSeconds);
  const topicsRemaining = totalTopics - request.currentTopicIndex;

  return {
    elapsedMinutes: (request.timerSeconds / 60).toFixed(1),
    remainingMinutes: (remainingSeconds / 60).toFixed(1),
    percentComplete: Math.min(100, Math.round((request.timerSeconds / totalSeconds) * 100)),
    topicsRemaining,
    minutesPerRemainingTopic:
      topicsRemaining > 0 ? parseFloat((remainingSeconds / 60 / topicsRemaining).toFixed(1)) : 0,
    minutesPerTopic:
      totalTopics > 0 ? parseFloat((totalMinutes / totalTopics).toFixed(2)) : totalMinutes,
    totalMinutes,
    totalTopics,
  };
}

export async function POST(req: NextRequest) {
  // Se declara fuera del `try` para que el `catch` pueda registrar el turno
  // fallido con el contexto que ya se hubiera resuelto.
  let telemetryContext: Pick<
    TelemetryTurn,
    'sessionId' | 'candidateName' | 'roleTitle' | 'orgId'
  > | null = null;

  try {
    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const request = chatRequestSchema.parse(rawBody);

    // ─── Autorización ───
    // Antes de gastar un solo token: la credencial tiene que acreditar ESTA
    // vacante. Un rechazo aquí no llega a OpenRouter ni escribe telemetría.
    const access = await requireInterviewAccess(rawBody, request.roleId);

    await enforceRateLimit(req, RATE_LIMITS.AI_CHAT, access.userId ?? request.sessionId);

    telemetryContext = {
      sessionId: request.sessionId ?? '',
      candidateName: request.candidateName || null,
      roleTitle: request.roleTitle || null,
      // Sale de la autorización, no del cuerpo de la petición: si viniera del cliente, quien
      // llama elegiría en qué organización aparece su turno.
      orgId: access.orgId || null,
    };

    // ─── Plan de tiempos ───
    const totalTopics = request.allTopics.length || 1;

    const plan = computeInterviewPlan(
      request.interviewDuration,
      request.allTopics.map((topic) => ({
        label: topic.label,
        weight: ensureRubric(topic).weight,
      })),
      { hasCv: hasUsableCv(request.cvData) },
    );

    const metrics = computeTimeMetrics(request, totalTopics);

    const turn = deriveTurnState({
      recentMessages: request.recentMessages,
      topicStartIndex: request.topicStartIndex,
      currentTopicIndex: request.currentTopicIndex,
      clientOpeningPhase: request.isOpeningPhase,
    });

    const baseHardLimit = getQuestionBudget(request.currentTopicIndex, plan).questionBudget;

    const pacing = computeRealTimePacing(
      request.timerSeconds,
      request.currentTopicIndex,
      turn.questionsInCurrentTopic,
      plan,
      { isGracePeriod: request.isGracePeriod },
    );

    // Se respeta el tope efectivo del motor, que ya incorpora la urgencia: cuando
    // el candidato va lento el límite se REDUCE de verdad, en vez de solo
    // sugerírselo al modelo, que lo ignoraba.
    const maxQuestionsHardLimit = Math.max(1, pacing.effectiveHardLimit);
    const mustAdvanceNow = turn.questionsInCurrentTopic >= maxQuestionsHardLimit;

    const phase = resolvePhase({
      isOpeningPhase: turn.isOpeningPhase,
      isClosingPhase: request.isClosingPhase,
      isLastTopic: request.isLastTopic,
      mustAdvanceNow,
      isTransitionToNewTopic: turn.isTransitionToNewTopic,
    });

    const systemPrompt = buildZaraSystemPrompt({
      request,
      plan,
      pacing,
      turn,
      metrics,
      phase,
      maxQuestionsHardLimit,
      baseHardLimit,
      mustAdvanceNow,
    });

    const turnDirective = buildTurnDirective({
      phase,
      currentTopic: request.currentTopic,
      questionsInCurrentTopic: turn.questionsInCurrentTopic,
      maxQuestionsHardLimit,
    });

    const messages = buildModelMessages({
      systemPrompt,
      recentMessages: request.recentMessages,
      turnDirective,
      isOpeningPhase: turn.isOpeningPhase,
    });

    // ─── Llamada al modelo ───
    const startedAt = Date.now();

    const completion = await chatCompletion({
      model: INTERVIEW_CHAT_MODEL,
      messages,
      temperature: 0.7,
      maxTokens: plan.paceConfig.maxTokensHint || 300,
      timeoutMs: MODEL_TIMEOUT_MS,
      title: 'Reclutify AI Interviewer',
      // Si el candidato cierra la pestaña o pasa de turno, se aborta la llamada.
      signal: req.signal,
    });

    const durationMs = Date.now() - startedAt;
    const message = stripModelArtifacts(completion.content);

    // ─── Telemetría ───
    // Se espera a que termine, a diferencia de antes: en serverless la instancia
    // puede congelarse en cuanto se devuelve la respuesta, y la telemetría se
    // perdía precisamente en los turnos lentos, los que interesa depurar. El
    // coste es una inserción, y no puede fallar la petición: `logInterviewTurn`
    // no lanza.
    await logInterviewTurn({
      ...telemetryContext,
      turnIndex: request.recentMessages.length + 1,
      model: completion.model,
      promptText: systemPrompt,
      responseText: message,
      reasoningText: completion.reasoning,
      durationMs,
      usage: completion.usage,
      debugState: {
        ...summarizeChatPayload({
          roleId: access.roleId,
          currentTopic: request.currentTopic,
          currentTopicIndex: request.currentTopicIndex,
          topicCount: totalTopics,
          messageCount: request.recentMessages.length,
          interviewMode: request.interviewMode,
          language: request.language,
          interviewDuration: request.interviewDuration,
          timerSeconds: request.timerSeconds,
          hasCv: hasUsableCv(request.cvData),
          cvExperienceCount: request.cvData?.experience.length ?? 0,
          cvSkillCount: request.cvData?.skills.length ?? 0,
          promptChars: systemPrompt.length,
        }),
        authorizedVia: access.via,
        phase,
        questionsInCurrentTopic: turn.questionsInCurrentTopic,
        maxQuestionsHardLimit,
        baseHardLimit,
        mustAdvanceNow,
        isClosingPhase: request.isClosingPhase,
        isGracePeriod: request.isGracePeriod,
        isLastTopic: request.isLastTopic,
        percentComplete: metrics.percentComplete,
        pacing: {
          onTrack: pacing.onTrack,
          urgency: pacing.urgency,
          addQuestions: pacing.suggestAddQuestions,
          skipQuestions: pacing.suggestSkipQuestions,
        },
        enginePlan: {
          usableSeconds: plan.usableSeconds,
          totalQuestions: plan.totalQuestions,
          questionStyle: plan.paceConfig.questionStyle,
          topicBudgets: plan.topics.map((topic) => ({
            label: topic.label,
            budget: topic.questionBudget,
            allocatedSec: topic.allocatedSeconds,
          })),
        },
      },
    });

    // `sentiment` se mantiene en la respuesta como `null` por compatibilidad: el
    // cliente lee la clave. El análisis en paralelo que existía se retiró porque
    // su resultado se descartaba (`sentiment: null` ya era lo que se devolvía) y
    // aun así se pagaba una segunda llamada al modelo en CADA turno.
    return NextResponse.json({ message, sentiment: null });
  } catch (error) {
    // Se intenta registrar el fallo aunque la petición se vaya con error: es la
    // telemetría más valiosa. Si no hay clave de servicio no se registra nada y
    // el error se devuelve igual.
    if (telemetryContext?.sessionId) {
      const status = error instanceof ApiError ? error.status : 500;

      await logInterviewTurn({
        ...telemetryContext,
        turnIndex: 0,
        model: INTERVIEW_CHAT_MODEL,
        errorText: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        debugState: { status },
      });
    }

    return handleApiError(error, '[chat]');
  }
}
