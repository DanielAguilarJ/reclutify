import { z } from 'zod';

// ─── Schemas existentes ───

const messageSchema = z
  .string()
  .trim()
  .min(1)
  .max(10_000);

export const trainingChatRequestSchema = z.union([
  z
    .object({
      mode: z.literal('general'),
      action: z.literal('start'),
    })
    .strict(),

  z
    .object({
      mode: z.literal('general'),
      message: messageSchema,
    })
    .strict(),

  z
    .object({
      mode: z.literal('module'),
      moduleId: z.string().uuid(),
      action: z.literal('start'),
    })
    .strict(),

  z
    .object({
      mode: z.literal('module'),
      moduleId: z.string().uuid(),
      message: messageSchema,
    })
    .strict(),
]);

export const updateTrainingTimeSchema = z
  .object({
    moduleId: z.string().uuid(),
    minutesDelta: z
      .number()
      .int()
      .min(1)
      .max(60),
  })
  .strict();

export const evaluateTrainingModuleSchema = z
  .object({
    moduleId: z.string().uuid(),
    answers: z
      .array(
        z
          .object({
            questionIndex: z
              .number()
              .int()
              .min(0),
            answer: z
              .string()
              .trim()
              .min(1)
              .max(20_000),
          })
          .strict()
      )
      .min(1)
      .max(20),
  })
  .strict();

// ─── Schemas nuevos — control de acceso ───

export const trainingAccessSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(32)
      .max(200),
  })
  .strict();

// ─── Schemas nuevos — módulos y secciones ───

export const startTrainingModuleSchema = z
  .object({
    moduleId: z.string().uuid(),
  })
  .strict();

export const completeTrainingModuleSchema = z
  .object({
    moduleId: z.string().uuid(),
  })
  .strict();

export const trainingSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(50_000),
    keyPoints: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(20),
  })
  .strict();

// ─── Base reutilizable para preguntas (invariantes estrictas) ───

const baseQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    type: z.enum(['multiple_choice', 'open_ended', 'true_false']),
    options: z
      .array(z.string().trim().min(1).max(500))
      .optional(),
    correctAnswer: z.string().trim().min(1).max(2_000),
    explanation: z.string().trim().max(2_000).optional(),
  })
  .strict()
  .superRefine((q, context) => {
    // 1. multiple_choice
    if (q.type === 'multiple_choice') {
      if (!q.options) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'multiple_choice questions must have options array',
        });
        return;
      }
      if (q.options.length < 2 || q.options.length > 20) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'multiple_choice questions must have between 2 and 20 options',
        });
      }
      const trimmedOpts = q.options.map(o => o.trim());
      const uniqueOpts = new Set(trimmedOpts);
      if (uniqueOpts.size !== trimmedOpts.length) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'options must be unique after trimming',
        });
      }
      const trimmedCorrect = q.correctAnswer.trim();
      if (!trimmedOpts.includes(trimmedCorrect)) {
        context.addIssue({
          code: 'custom',
          path: ['correctAnswer'],
          message: 'correctAnswer must match one of the options (case-sensitive, trimmed)',
        });
      }
    }

    // 2. true_false
    if (q.type === 'true_false') {
      if (!q.options) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'true_false questions must have options array',
        });
        return;
      }
      if (q.options.length !== 2) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'true_false questions must have exactly 2 options',
        });
      }
      const trimmedOpts = q.options.map(o => o.trim());
      const uniqueOpts = new Set(trimmedOpts);
      if (uniqueOpts.size !== trimmedOpts.length) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'options must be unique after trimming',
        });
      }
      const trimmedCorrect = q.correctAnswer.trim();
      if (!trimmedOpts.includes(trimmedCorrect)) {
        context.addIssue({
          code: 'custom',
          path: ['correctAnswer'],
          message: 'correctAnswer must match one of the options (case-sensitive, trimmed)',
        });
      }
    }

    // 3. open_ended
    if (q.type === 'open_ended') {
      if (q.options && q.options.length > 0) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'open_ended questions must not have options',
        });
      }
    }
  });

export const trainingQuestionAdminSchema = baseQuestionSchema;

// Validador de invariantes de módulos comunes
const validateModuleInvariants = (mod: {
  title: string;
  sections?: Array<{ title: string; body: string; keyPoints: string[] }> | null;
  content?: { sections: Array<{ title: string; body: string; keyPoints: string[] }> } | null;
  evaluationEnabled: boolean;
  evaluationQuestions: unknown[];
  sourceDocumentIds: string[];
}, context: z.RefinementCtx) => {
  const sections = mod.content?.sections ?? mod.sections;
  if (!sections || sections.length < 1) {
    context.addIssue({
      code: 'custom',
      path: [mod.content ? 'content' : 'sections'],
      message: 'A module must have at least one section',
    });
  }

  if (mod.evaluationEnabled) {
    if (!mod.evaluationQuestions || mod.evaluationQuestions.length < 1) {
      context.addIssue({
        code: 'custom',
        path: ['evaluationQuestions'],
        message: 'evaluationQuestions must contain at least one question when evaluationEnabled is true',
      });
    }
  } else {
    if (mod.evaluationQuestions && mod.evaluationQuestions.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['evaluationQuestions'],
        message: 'evaluationQuestions must be empty when evaluationEnabled is false',
      });
    }
  }

  const uniqueDocIds = new Set(mod.sourceDocumentIds);
  if (uniqueDocIds.size !== mod.sourceDocumentIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['sourceDocumentIds'],
      message: 'Duplicate source document IDs are not allowed',
    });
  }
};

const manualTrainingModuleBase = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    content: z
      .object({
        sections: z.array(trainingSectionSchema).max(100),
      })
      .strict(),
    durationEstimate: z.number().int().min(1).max(480),
    evaluationEnabled: z.boolean(),
    evaluationQuestions: z.array(trainingQuestionAdminSchema).max(20),
    sourceDocumentIds: z.array(z.string().uuid()),
  })
  .strict();

export const manualTrainingModuleSchema = manualTrainingModuleBase
  .superRefine((mod, ctx) => validateModuleInvariants(mod, ctx));

export const updateManualTrainingModuleSchema = manualTrainingModuleBase
  .partial()
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    { message: 'At least one field is required' }
  );

export const reorderTrainingModulesSchema = z
  .object({
    moduleIds: z.array(z.string().uuid()).min(1),
  })
  .strict()
  .superRefine((body, context) => {
    const unique = new Set(body.moduleIds);
    if (unique.size !== body.moduleIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['moduleIds'],
        message: 'Duplicate module IDs are not allowed',
      });
    }
  });

// ─── Schemas nuevos — programas ───

export const createTrainingProgramSchema = z
  .object({
    roleId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    welcomeMessage: z.string().trim().max(5_000).optional(),
    aiPersonality: z.enum([
      'friendly_mentor',
      'strict_teacher',
      'casual_colleague',
    ]),
  })
  .strict();

export const updateTrainingProgramSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z
      .string()
      .trim()
      .max(5_000)
      .nullable()
      .optional(),
    welcomeMessage: z
      .string()
      .trim()
      .max(5_000)
      .nullable()
      .optional(),
    aiPersonality: z
      .enum(['friendly_mentor', 'strict_teacher', 'casual_colleague'])
      .optional(),
    passingScore: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine(
    (body) => Object.keys(body).length > 0,
    { message: 'At least one update is required' }
  );

// ─── Schemas nuevos — documentos ───

export const generateModulesRequestSchema = z
  .object({
    programId: z.string().uuid(),
  })
  .strict();

export const attachTrainingDocumentSchema = z
  .object({
    documentId: z.string().uuid(),
    required: z.boolean().default(true),
  })
  .strict();

export const detachTrainingDocumentQuerySchema = z
  .object({
    documentId: z.string().uuid(),
  })
  .strict();

export const trainingDocumentUploadMetadataSchema = z
  .object({
    programId: z.string().uuid(),
    scope: z.enum(['role', 'organization']),
  })
  .strict();

// ─── Schemas nuevos — respuestas de IA ───

export const documentAiAnalysisSchema = z
  .object({
    summary: z.string().trim().max(5_000),
    topics: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(300),
            description: z.string().trim().max(1_000),
            keyPoints: z
              .array(z.string().trim().min(1).max(500))
              .max(20),
          })
          .strict()
      )
      .max(50),
  })
  .strict();

export const trainingTutorResponseSchema = z
  .object({
    message: z.string().trim().min(1).max(10_000),
    type: z.enum(['text', 'feedback']),
    contentCovered: z.boolean().default(false),
    evaluationReady: z.boolean().default(false),
    citationChunkIds: z
      .array(z.string().uuid())
      .max(8)
      .default([]),
  })
  .strict();

export const generatedModuleSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    body: z.string().trim().min(1).max(50_000),
    keyPoints: z
      .array(z.string().trim().min(1).max(500))
      .min(1)
      .max(20),
  })
  .strict();

export const generatedModuleQuestionSchema = baseQuestionSchema;

const generatedTrainingModuleBase = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    sections: z
      .array(generatedModuleSectionSchema)
      .min(1)
      .max(50),
    evaluationEnabled: z.boolean(),
    evaluationQuestions: z
      .array(generatedModuleQuestionSchema)
      .max(20),
    sourceDocumentIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20),
    durationEstimate: z.number().int().min(1).max(480).optional(),
  })
  .strict();

export const generatedTrainingModuleSchema = generatedTrainingModuleBase
  .superRefine((mod, ctx) => validateModuleInvariants(mod, ctx));

export const generatedTrainingModulesSchema = z
  .object({
    modules: z
      .array(generatedTrainingModuleSchema)
      .min(1)
      .max(50),
  })
  .strict();

export const openEndedGradingSchema = z
  .object({
    evaluations: z
      .array(
        z
          .object({
            index: z.number().int().min(0),
            correct: z.boolean(),
            explanation: z
              .string()
              .trim()
              .min(1)
              .max(2_000),
          })
          .strict()
      ),
  })
  .strict();

// ─── Schemas nuevos — mensajes persistidos ───

export const persistedTrainingMessageSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z
      .string()
      .trim()
      .min(1)
      .max(10_000),
    timestamp: z.number().int().nonnegative(),
    type: z
      .enum(['text', 'feedback'])
      .optional(),
    citations: z
      .array(
        z
          .object({
            documentId: z.string().uuid(),
            fileName: z.string().trim().min(1).max(500),
            chunkIndex: z.number().int().nonnegative(),
            snippet: z.string().max(500),
          })
          .strict()
      )
      .max(8)
      .optional(),
  })
  .strict();

export const persistedTrainingMessagesSchema = z
  .array(persistedTrainingMessageSchema)
  .max(200);

export const hireTrainingCandidateSchema = z
  .object({
    candidateResultId: z
      .string()
      .trim()
      .min(1)
      .max(200),
    programId: z.string().uuid(),
  })
  .strict();

export const trainingPersonalizationSchema = z
  .object({
    strengths: z
      .array(z.string().trim().min(1).max(500))
      .max(10),
    areasToWatch: z
      .array(z.string().trim().min(1).max(500))
      .max(10),
    learningStyle: z
      .string()
      .trim()
      .max(1_000),
    customTips: z
      .array(z.string().trim().min(1).max(500))
      .max(10),
  })
  .strict();

export const trainingEvaluationRpcResultSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    passed: z.boolean(),
    passingScore: z.number().int().min(0).max(100),
    attempts: z.number().int().min(0),
    overallProgress: z.number().int().min(0).max(100),
    overallScore: z.number().int().min(0).max(100),
  })
  .strict();

export const completeTrainingModuleRpcResultSchema = z
  .object({
    overallProgress: z.number().int().min(0).max(100),
    overallScore: z.number().int().min(0).max(100),
    nextModuleId: z.string().uuid().nullable(),
  })
  .strict();
