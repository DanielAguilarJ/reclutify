// @vitest-environment node

import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  applyWeightedScore,
  computeWeightedScore,
  toRecommendation,
  RECOMMENDATION_THRESHOLDS,
  DEFAULT_TOPIC_WEIGHT,
} from '@/lib/services/evaluation.service';
import type { InterviewTopicInput } from '@/lib/schemas/interview';

/**
 * Pruebas del cálculo de la puntuación del candidato.
 *
 * POR QUÉ ESTA ES LA LÓGICA QUE MÁS IMPORTA PROBAR
 * ------------------------------------------------
 * Decide si un candidato aparece como «Strong Hire» o como «Pass» ante quien contrata. Un
 * error de dos puntos cruza el umbral de 80 y cambia la recomendación, y nadie lo notaría:
 * la salida es un número plausible en cualquier caso.
 *
 * Estaba dentro de `/api/evaluate`, así que la única forma de comprobarla era ejecutar la
 * ruta simulando OpenRouter. Ahora es una función pura con una tabla de casos.
 */

/** Construye un criterio con el peso dado. */
function topic(label: string, weight?: number): InterviewTopicInput {
  return weight === undefined
    ? { label }
    : { label, rubric: { weight, excellent: '', acceptable: '', poor: '' } };
}

describe('toRecommendation', () => {
  it('aplica los umbrales exactos', () => {
    // Los límites se comprueban EN el umbral, no cerca: `>=80` y `>80` son la diferencia
    // entre que un candidato con exactamente 80 sea «Strong Hire» o no.
    expect(toRecommendation(RECOMMENDATION_THRESHOLDS.STRONG_HIRE)).toBe('Strong Hire');
    expect(toRecommendation(RECOMMENDATION_THRESHOLDS.STRONG_HIRE - 1)).toBe('Hire');
    expect(toRecommendation(RECOMMENDATION_THRESHOLDS.HIRE)).toBe('Hire');
    expect(toRecommendation(RECOMMENDATION_THRESHOLDS.HIRE - 1)).toBe('Pass');
    expect(toRecommendation(0)).toBe('Pass');
    expect(toRecommendation(100)).toBe('Strong Hire');
  });
});

describe('computeWeightedScore', () => {
  it('calcula la media ponderada con la fórmula del prompt', () => {
    // (9×10 + 5×2) / (10+2) × 10 = (90+10)/12 × 10 = 83.33 → 83
    const result = computeWeightedScore(
      { 'Técnica': 9, 'Comunicación': 5 },
      [topic('Técnica', 10), topic('Comunicación', 2)],
    );

    expect(result.overallScore).toBe(83);
    expect(result.recommendation).toBe('Strong Hire');
    expect(result.computed).toBe(true);
  });

  it('un criterio con peso alto pesa más que uno con peso bajo', () => {
    // Es la propiedad que el reclutador espera al ajustar los pesos: si no se cumpliera, la
    // rúbrica sería decorativa.
    const strongOnCritical = computeWeightedScore(
      { 'Crítico': 10, 'Menor': 0 },
      [topic('Crítico', 9), topic('Menor', 1)],
    );
    const strongOnMinor = computeWeightedScore(
      { 'Crítico': 0, 'Menor': 10 },
      [topic('Crítico', 9), topic('Menor', 1)],
    );

    expect(strongOnCritical.overallScore).toBeGreaterThan(strongOnMinor.overallScore);
    expect(strongOnCritical.overallScore).toBe(90);
    expect(strongOnMinor.overallScore).toBe(10);
  });

  it('un criterio SIN puntuación cuenta como 0, no se omite', () => {
    // Omitirlo subiría la nota por un tema que el modelo no evaluó, es decir premiaría un
    // hueco en la evaluación.
    const result = computeWeightedScore({ 'Técnica': 10 }, [topic('Técnica', 5), topic('Sin evaluar', 5)]);

    expect(result.overallScore).toBe(50);
  });

  it('descarta del divisor los criterios con peso 0', () => {
    // Contarlos dejaría el divisor inflado y bajaría la nota por un criterio que el
    // reclutador marcó como irrelevante.
    const result = computeWeightedScore(
      { 'Relevante': 8, 'Irrelevante': 0 },
      [topic('Relevante', 10), topic('Irrelevante', 0)],
    );

    expect(result.overallScore).toBe(80);
  });

  it('acota una puntuación fuera de rango en lugar de descartar el criterio', () => {
    // El modelo devuelve ocasionalmente 11 o -1. Descartar el criterio entero perdería su
    // juicio sobre ese tema.
    expect(computeWeightedScore({ 'A': 15 }, [topic('A', 5)]).overallScore).toBe(100);
    expect(computeWeightedScore({ 'A': -5 }, [topic('A', 5)]).overallScore).toBe(0);
  });

  it('usa el peso por defecto para un criterio sin rúbrica', () => {
    const withDefault = computeWeightedScore({ 'A': 6, 'B': 6 }, [topic('A'), topic('B')]);
    const withExplicit = computeWeightedScore(
      { 'A': 6, 'B': 6 },
      [topic('A', DEFAULT_TOPIC_WEIGHT), topic('B', DEFAULT_TOPIC_WEIGHT)],
    );

    expect(withDefault.overallScore).toBe(withExplicit.overallScore);
  });

  it('informa cuando no hay pesos utilizables en vez de devolver 0 como juicio', () => {
    const result = computeWeightedScore({ 'A': 9 }, [topic('A', 0)]);

    // `computed: false` es lo que permite al llamante conservar lo que dijo el modelo. Un 0
    // escrito como resultado se leería como «candidato evaluado y suspendido».
    expect(result.computed).toBe(false);
  });

  it('devuelve computed:false sin criterios', () => {
    expect(computeWeightedScore({}, []).computed).toBe(false);
  });

  it('ignora puntuaciones no numéricas', () => {
    const result = computeWeightedScore(
      { 'A': Number.NaN, 'B': 10 } as Record<string, number>,
      [topic('A', 5), topic('B', 5)],
    );

    // `NaN` se trata como 0, igual que una puntuación ausente: propagarlo daría `NaN` como
    // puntuación final y la interfaz mostraría un informe roto.
    expect(result.overallScore).toBe(50);
  });
});

describe('applyWeightedScore', () => {
  it('sustituye la puntuación del modelo por la calculada', () => {
    // El modelo dice 95; la aritmética dice 83. Se hace caso a la aritmética: una media
    // ponderada no es algo que un modelo de lenguaje calcule, la aproxima, y varios puntos
    // cruzan el umbral que separa «Strong Hire» de «Hire».
    const evaluation = applyWeightedScore(
      { overallScore: 95, recommendation: 'Strong Hire', topicScores: { 'Técnica': 9, 'Comunicación': 5 } },
      [topic('Técnica', 10), topic('Comunicación', 2)],
    );

    expect(evaluation.overallScore).toBe(83);
    expect(evaluation.recommendation).toBe('Strong Hire');
  });

  it('corrige la recomendación cuando el modelo se pasa de optimista', () => {
    const evaluation = applyWeightedScore(
      { overallScore: 88, recommendation: 'Strong Hire', topicScores: { 'A': 5 } },
      [topic('A', 5)],
    );

    expect(evaluation.overallScore).toBe(50);
    expect(evaluation.recommendation).toBe('Pass');
  });

  it('NO muta el objeto de entrada', () => {
    const original = { overallScore: 95, recommendation: 'Strong Hire', topicScores: { 'A': 5 } };

    applyWeightedScore(original, [topic('A', 5)]);

    // Mutarlo haría que la telemetría —que se escribe después— guardara la versión
    // corregida, y con ella se pierde la única forma de detectar que el modelo calcula mal.
    expect(original.overallScore).toBe(95);
    expect(original.recommendation).toBe('Strong Hire');
  });

  it('conserva el resto de campos de la evaluación', () => {
    const evaluation = applyWeightedScore(
      {
        candidateName: 'Candidata Ficticia',
        overallScore: 50,
        topicScores: { 'A': 8 },
        pros: ['algo'],
        biasFlags: [],
      },
      [topic('A', 5)],
    );

    expect(evaluation.candidateName).toBe('Candidata Ficticia');
    expect(evaluation.pros).toEqual(['algo']);
    expect(evaluation.biasFlags).toEqual([]);
  });

  it('devuelve la evaluación intacta si falta topicScores', () => {
    const evaluation = applyWeightedScore({ overallScore: 77, recommendation: 'Hire' }, [topic('A', 5)]);

    expect(evaluation.overallScore).toBe(77);
    expect(evaluation.recommendation).toBe('Hire');
  });

  it('devuelve la evaluación intacta si no hay criterios', () => {
    const evaluation = applyWeightedScore({ overallScore: 77, topicScores: { 'A': 1 } }, []);

    expect(evaluation.overallScore).toBe(77);
  });
});
