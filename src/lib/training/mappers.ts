import type {
  EmployeeTrainingModule,
  TrainingQuestionPublic,
  TrainingModuleSection,
} from '@/types';

/**
 * Mapea una fila de la base de datos de training_modules al tipo público
 * EmployeeTrainingModule, que expone solo TrainingQuestionPublic[].
 *
 * NUNCA expone correctAnswer ni explanation.
 */
export function mapEmployeeTrainingModule(
  row: Record<string, unknown>
): EmployeeTrainingModule {
  const rawQuestions = Array.isArray(row.evaluation_questions)
    ? row.evaluation_questions
    : [];

  const publicQuestions: TrainingQuestionPublic[] = rawQuestions
    .filter(
      (q): q is Record<string, unknown> =>
        Boolean(q) && typeof q === 'object'
    )
    .map((q) => {
      const safe: TrainingQuestionPublic = {
        question: String(q.question ?? ''),
        type: (['multiple_choice', 'open_ended', 'true_false'] as const).includes(
          q.type as 'multiple_choice' | 'open_ended' | 'true_false'
        )
          ? (q.type as TrainingQuestionPublic['type'])
          : 'open_ended',
      };

      if (Array.isArray(q.options)) {
        safe.options = q.options
          .filter((o): o is string => typeof o === 'string')
          .slice(0, 20);
      }

      return safe;
    });

  const rawContent = row.content as { sections?: unknown[] } | undefined;
  const sections: TrainingModuleSection[] = Array.isArray(rawContent?.sections)
    ? (rawContent!.sections as Record<string, unknown>[]).map((s) => ({
        title: String(s.title ?? ''),
        body: String(s.body ?? ''),
        keyPoints: Array.isArray(s.keyPoints)
          ? s.keyPoints.filter((k): k is string => typeof k === 'string')
          : [],
      }))
    : [];

  return {
    id: String(row.id ?? ''),
    programId: String(row.program_id ?? ''),
    title: String(row.title ?? ''),
    description:
      typeof row.description === 'string' ? row.description : undefined,
    content: { sections },
    sourceDocumentIds: Array.isArray(row.source_document_ids)
      ? (row.source_document_ids as unknown[]).filter(
          (id): id is string => typeof id === 'string'
        )
      : [],
    sortOrder: typeof row.sort_order === 'number' ? row.sort_order : 0,
    durationEstimate:
      typeof row.duration_estimate === 'number' ? row.duration_estimate : 15,
    evaluationEnabled:
      typeof row.evaluation_enabled === 'boolean' ? row.evaluation_enabled : false,
    evaluationQuestions: publicQuestions,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}
