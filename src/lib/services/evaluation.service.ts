import 'server-only';

import type { InterviewTopicInput } from '@/lib/schemas/interview';

/**
 * Reglas de la evaluación del candidato.
 *
 * POR QUÉ ESTO NO VIVE EN LA RUTA
 * -------------------------------
 * El recálculo de la puntuación estaba dentro de `/api/evaluate`, entre la llamada al
 * modelo y el envío del correo. Es la parte del producto con más consecuencias —decide si
 * un candidato aparece como «Strong Hire» o como «Pass» ante quien contrata— y era la
 * única sin poder probarse sin simular OpenRouter.
 *
 * Aquí son funciones puras: reciben las puntuaciones por criterio y los pesos, y devuelven
 * la puntuación. Se pueden comprobar con una tabla de casos.
 *
 * POR QUÉ NO SE HACE CASO A LA PUNTUACIÓN DEL MODELO
 * --------------------------------------------------
 * El prompt le pide al modelo que calcule `overallScore` como media ponderada, y el modelo
 * la produce. No se usa: una media ponderada es aritmética y un modelo de lenguaje la
 * APROXIMA. Con pesos de 9 y 2 el error es de varios puntos, y varios puntos cruzan el
 * umbral de 80 que separa «Strong Hire» de «Hire».
 *
 * La calcula código determinista a partir de las puntuaciones por criterio —que sí son
 * juicio del modelo, y para eso está— y de los pesos que fijó el reclutador.
 */

/** Umbrales de recomendación. Son los que ya aplicaba la ruta. */
export const RECOMMENDATION_THRESHOLDS = {
  STRONG_HIRE: 80,
  HIRE: 60,
} as const;

/** Recomendaciones posibles. */
export type HiringRecommendation = 'Strong Hire' | 'Hire' | 'Pass';

/** Peso por defecto de un criterio sin rúbrica. */
export const DEFAULT_TOPIC_WEIGHT = 5;

/**
 * Traduce una puntuación de 0-100 a una recomendación.
 *
 * Se exporta por separado para que la tabla de umbrales sea comprobable sin construir una
 * evaluación completa.
 */
export function toRecommendation(overallScore: number): HiringRecommendation {
  if (overallScore >= RECOMMENDATION_THRESHOLDS.STRONG_HIRE) return 'Strong Hire';
  if (overallScore >= RECOMMENDATION_THRESHOLDS.HIRE) return 'Hire';
  return 'Pass';
}

/** Puntuación por criterio, tal como la devuelve el modelo. */
export type TopicScores = Record<string, number>;

export interface WeightedScoreResult {
  /** Puntuación 0-100, redondeada. */
  overallScore: number;
  recommendation: HiringRecommendation;
  /** `false` si no había pesos utilizables y la puntuación no se pudo calcular. */
  computed: boolean;
}

/**
 * Calcula la media ponderada de las puntuaciones por criterio.
 *
 * La fórmula es la del prompt: `sum(puntuación × peso) / sum(pesos) × 10`. Las puntuaciones
 * por criterio van de 0 a 10 y el resultado de 0 a 100.
 *
 * DECISIONES QUE PARECEN DETALLES Y NO LO SON
 * -------------------------------------------
 *  - **Un criterio sin puntuación cuenta como 0**, no se omite. Omitirlo subiría la nota
 *    del candidato por un tema que el modelo no evaluó, que es premiar un hueco.
 *  - **Un criterio con peso 0 se descarta del divisor.** Contarlo dejaría el divisor
 *    inflado y bajaría la nota por un criterio que el reclutador marcó como irrelevante.
 *  - **Una puntuación fuera de 0-10 se acota** en lugar de descartarse: el modelo devuelve
 *    ocasionalmente 11 o -1, y descartar el criterio entero por eso perdería su juicio.
 *
 * @param topicScores Puntuaciones por etiqueta de criterio.
 * @param topics Criterios con su rúbrica, de donde salen los pesos.
 */
export function computeWeightedScore(
  topicScores: TopicScores,
  topics: readonly InterviewTopicInput[],
): WeightedScoreResult {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const topic of topics) {
    const weight = topic.rubric?.weight ?? DEFAULT_TOPIC_WEIGHT;

    // Peso 0: el reclutador lo marcó irrelevante. No entra en el divisor.
    if (weight <= 0) continue;

    const rawScore = topicScores[topic.label];
    const score =
      typeof rawScore === 'number' && Number.isFinite(rawScore)
        ? Math.min(10, Math.max(0, rawScore))
        : 0;

    weightedSum += score * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) {
    // Sin pesos utilizables no hay nada que calcular. Se informa con `computed: false` para
    // que el llamante conserve lo que dijo el modelo en lugar de escribir un 0, que se
    // leería como «candidato evaluado y suspendido».
    return { overallScore: 0, recommendation: 'Pass', computed: false };
  }

  const overallScore = Math.min(100, Math.max(0, Math.round((weightedSum / totalWeight) * 10)));

  return { overallScore, recommendation: toRecommendation(overallScore), computed: true };
}

/** Evaluación tal como la devuelve el modelo, antes del recálculo. */
export interface RawEvaluation {
  candidateName?: string;
  overallScore?: number;
  recommendation?: string;
  topicScores?: TopicScores;
  [key: string]: unknown;
}

/**
 * Devuelve la evaluación con `overallScore` y `recommendation` recalculados.
 *
 * No muta el objeto de entrada: devuelve uno nuevo. Mutar la respuesta del modelo haría que
 * el registro de telemetría —que se escribe después— guardara la versión corregida en vez
 * de la original, y con ella se pierde la única forma de detectar que el modelo calcula mal.
 */
export function applyWeightedScore(
  evaluation: RawEvaluation,
  topics: readonly InterviewTopicInput[],
): RawEvaluation {
  const topicScores = evaluation.topicScores;

  if (!topicScores || typeof topicScores !== 'object' || topics.length === 0) {
    return { ...evaluation };
  }

  const result = computeWeightedScore(topicScores, topics);

  // Sin pesos utilizables se conserva lo que dijo el modelo: es peor información que un
  // cálculo determinista, pero mejor que un 0 que parece un juicio.
  if (!result.computed) return { ...evaluation };

  return {
    ...evaluation,
    overallScore: result.overallScore,
    recommendation: result.recommendation,
  };
}
