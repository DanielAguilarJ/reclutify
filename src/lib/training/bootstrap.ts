import type { TrainingQuestionPublic } from '@/types';

/**
 * Filtra una lista de preguntas de evaluación y elimina los campos
 * que NO deben exponerse al empleado: correctAnswer y explanation.
 *
 * Esta función es la única fuente de verdad para la sanitización.
 * Se usa tanto en el endpoint /api/training/bootstrap como en los tests.
 */
export function sanitizePublicQuestions(
  questions: unknown
): TrainingQuestionPublic[] {
  if (!Array.isArray(questions)) {
    return [];
  }

  return questions
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object'
    )
    .map((item) => {
      const safe: TrainingQuestionPublic = {
        question: String(item.question ?? ''),
        type: (['multiple_choice', 'open_ended', 'true_false'] as const).includes(
          item.type as 'multiple_choice' | 'open_ended' | 'true_false'
        )
          ? (item.type as TrainingQuestionPublic['type'])
          : 'open_ended',
      };

      if (Array.isArray(item.options)) {
        safe.options = item.options
          .filter((o): o is string => typeof o === 'string')
          .slice(0, 20);
      }

      return safe;
    });
}
