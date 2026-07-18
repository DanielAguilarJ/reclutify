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
              .max(20_000),
          })
          .strict()
      )
      .min(1)
      .max(100),
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

export const trainingQuestionAdminSchema = z
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
  .superRefine((question, context) => {
    if (question.type === 'multiple_choice') {
      if (!question.options || question.options.length < 2) {
        context.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'multiple_choice questions must have at least 2 options',
        });
      }
    }
  });

export const manualTrainingModuleSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(5_000).optional(),
    content: z
      .object({
        sections: z
          .array(trainingSectionSchema)
          .max(100),
      })
      .strict(),
    durationEstimate: z.number().int().min(1).max(480),
    evaluationEnabled: z.boolean(),
    evaluationQuestions: z.array(trainingQuestionAdminSchema),
    sourceDocumentIds: z.array(z.string().uuid()),
  })
  .strict();

export const updateManualTrainingModuleSchema = manualTrainingModuleSchema
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
    contentCovered: z
      .array(z.string().trim().min(1).max(200))
      .max(20)
      .optional(),
    evaluationReady: z.boolean().optional(),
    citationChunkIds: z
      .array(z.string().uuid())
      .max(8)
      .optional(),
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

export const generatedModuleQuestionSchema = z
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
  .superRefine((q, ctx) => {
    if (q.type === 'multiple_choice' && (!q.options || q.options.length < 2)) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'multiple_choice questions must have at least 2 options',
      });
    }
  });

export const generatedTrainingModuleSchema = z
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
      .array(z.string())
      .min(1)
      .max(20),
    durationEstimate: z.number().int().min(1).max(480).optional(),
  })
  .strict();

export const generatedTrainingModulesSchema = z
  .array(generatedTrainingModuleSchema)
  .min(1)
  .max(50);

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
