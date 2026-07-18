import { z } from 'zod';

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
