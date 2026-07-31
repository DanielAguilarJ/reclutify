import { describe, expect, it } from 'vitest';

import {
  CRITICAL_TOPIC_WEIGHT,
  DEFAULT_TOPIC_WEIGHT,
  hasCompleteRubric,
  isCriticalTopic,
} from '@/lib/interview/rubric';

/**
 * Estas dos funciones deciden si se bloquea el guardado de un criterio crítico y si «Enriquecer
 * con IA» conserva o machaca lo que el reclutador escribió a mano. La comprobación estaba
 * duplicada tres veces dentro de una página de 1800 líneas.
 */
describe('hasCompleteRubric', () => {
  const full = { weight: 5, excellent: 'excelente', acceptable: 'aceptable', poor: 'deficiente' };

  it('acepta una rúbrica con los tres niveles', () => {
    expect(hasCompleteRubric(full)).toBe(true);
  });

  it('rechaza `undefined`', () => {
    expect(hasCompleteRubric(undefined)).toBe(false);
  });

  it.each(['excellent', 'acceptable', 'poor'] as const)(
    'rechaza si falta `%s`',
    (missing) => {
      // Los tres hacen falta: Zara compara contra los tres descriptores y sin uno el nivel
      // correspondiente no se puede asignar.
      expect(hasCompleteRubric({ ...full, [missing]: '' })).toBe(false);
    },
  );

  it.each(['excellent', 'acceptable', 'poor'] as const)(
    'rechaza si `%s` es solo espacios',
    (blank) => {
      // Importa porque el campo es un `input` de texto y un espacio es lo que queda al borrar.
      expect(hasCompleteRubric({ ...full, [blank]: '   \n\t' })).toBe(false);
    },
  );

  it('no le afecta el peso', () => {
    // La completitud y la criticidad son preguntas distintas; mezclarlas fue lo que hizo que la
    // comprobación se escribiera de tres formas.
    expect(hasCompleteRubric({ ...full, weight: 0 })).toBe(true);
    expect(hasCompleteRubric({ ...full, weight: 10 })).toBe(true);
  });
});

describe('isCriticalTopic', () => {
  it('el umbral es 8 e incluye el 8', () => {
    expect(isCriticalTopic({ weight: CRITICAL_TOPIC_WEIGHT })).toBe(true);
    expect(isCriticalTopic({ weight: CRITICAL_TOPIC_WEIGHT - 1 })).toBe(false);
  });

  it('sin peso declarado usa el valor por defecto, que no es crítico', () => {
    expect(DEFAULT_TOPIC_WEIGHT).toBeLessThan(CRITICAL_TOPIC_WEIGHT);
    expect(isCriticalTopic(undefined)).toBe(false);
    expect(isCriticalTopic({})).toBe(false);
  });

  it('un peso de 10 es crítico', () => {
    expect(isCriticalTopic({ weight: 10 })).toBe(true);
  });

  it('un peso de 0 no es crítico', () => {
    // Peso 0 significa «irrelevante», y la evaluación además lo descarta del divisor.
    expect(isCriticalTopic({ weight: 0 })).toBe(false);
  });
});
