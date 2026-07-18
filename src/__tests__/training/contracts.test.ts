import { describe, it, expect } from 'vitest';
import {
  trainingChatRequestSchema,
  updateTrainingTimeSchema,
  trainingAccessSchema,
  createTrainingProgramSchema,
  updateTrainingProgramSchema,
  attachTrainingDocumentSchema,
  reorderTrainingModulesSchema,
  generatedTrainingModulesSchema,
  generatedTrainingModuleSchema,
  openEndedGradingSchema,
  evaluateTrainingModuleSchema,
  trainingTutorResponseSchema,
  trainingQuestionAdminSchema,
  manualTrainingModuleSchema,
} from '../../lib/training/contracts';

describe('Training Center V2 Contract Integrity', () => {
  // ─── trainingTutorResponseSchema ───
  it('tutor response schema accepts boolean and applies defaults', () => {
    const parsed = trainingTutorResponseSchema.safeParse({
      message: 'Hello, let\'s learn about Reclutify.',
      type: 'text',
      contentCovered: true,
      evaluationReady: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contentCovered).toBe(true);
      expect(parsed.data.evaluationReady).toBe(false);
      expect(parsed.data.citationChunkIds).toEqual([]);
    }
  });

  it('tutor response schema fallback to defaults when properties are absent', () => {
    const parsed = trainingTutorResponseSchema.safeParse({
      message: 'Let\'s start!',
      type: 'feedback',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.contentCovered).toBe(false);
      expect(parsed.data.evaluationReady).toBe(false);
      expect(parsed.data.citationChunkIds).toEqual([]);
    }
  });

  // ─── trainingChatRequestSchema ───
  it('rejects employeeId and messages in chat body', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'general',
      employeeId: '123',
      message: 'hello',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid module chat message', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'module',
      moduleId: '00000000-0000-4000-8000-000000000001',
      message: 'Tell me about the code guidelines',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mode:module without moduleId', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'module',
      message: 'guidelines',
    });
    expect(result.success).toBe(false);
  });

  it('rejects both action:start and message in same request', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'general',
      action: 'start',
      message: 'hello',
    });
    expect(result.success).toBe(false);
  });

  // ─── updateTrainingTimeSchema ───
  it('rejects absolute timeSpent updates and checks minutesDelta restrictions', () => {
    const result = updateTrainingTimeSchema.safeParse({
      moduleId: '00000000-0000-4000-8000-000000000001',
      timeSpent: 120, // should not allow setting absolute
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid time delta', () => {
    const result = updateTrainingTimeSchema.safeParse({
      moduleId: '00000000-0000-4000-8000-000000000001',
      minutesDelta: 5,
    });
    expect(result.success).toBe(true);
  });

  // ─── trainingAccessSchema ───
  it('rejects short tokens in access schema', () => {
    const result = trainingAccessSchema.safeParse({ token: 'too_short' });
    expect(result.success).toBe(false);
  });

  it('accepts valid training access token', () => {
    const result = trainingAccessSchema.safeParse({
      token: '1234567890123456789012345678901234567890',
    });
    expect(result.success).toBe(true);
  });

  // ─── createTrainingProgramSchema ───
  it('rejects invalid aiPersonality in createTrainingProgramSchema', () => {
    const result = createTrainingProgramSchema.safeParse({
      roleId: 'role-123',
      title: 'Program 1',
      aiPersonality: 'mean_boss', // invalid personality enum
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid createTrainingProgramSchema', () => {
    const result = createTrainingProgramSchema.safeParse({
      roleId: 'role-123',
      title: 'Program 1',
      aiPersonality: 'friendly_mentor',
    });
    expect(result.success).toBe(true);
  });

  // ─── updateTrainingProgramSchema ───
  it('rejects empty update in updateTrainingProgramSchema', () => {
    const result = updateTrainingProgramSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts partial update', () => {
    const result = updateTrainingProgramSchema.safeParse({
      title: 'Updated title',
    });
    expect(result.success).toBe(true);
  });

  // ─── attachTrainingDocumentSchema ───
  it('rejects invalid document UUID in attach schema', () => {
    const result = attachTrainingDocumentSchema.safeParse({
      documentId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid attach schema', () => {
    const result = attachTrainingDocumentSchema.safeParse({
      documentId: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.success).toBe(true);
  });

  // ─── trainingQuestionAdminSchema Invariants ───
  it('rejects multiple_choice question without options', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Where is the kitchen?',
      type: 'multiple_choice',
      correctAnswer: 'Floor 1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple_choice question with options length < 2', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Where is the kitchen?',
      type: 'multiple_choice',
      options: ['Floor 1'],
      correctAnswer: 'Floor 1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple_choice question with options length > 20', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Pick a number',
      type: 'multiple_choice',
      options: Array.from({ length: 21 }, (_, i) => `Option ${i}`),
      correctAnswer: 'Option 1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple_choice question with duplicate options', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Where is the kitchen?',
      type: 'multiple_choice',
      options: ['Floor 1', 'Floor 1', 'Floor 2'],
      correctAnswer: 'Floor 1',
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple_choice question if correctAnswer is not in options', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Where is the kitchen?',
      type: 'multiple_choice',
      options: ['Floor 1', 'Floor 2'],
      correctAnswer: 'Floor 3',
    });
    expect(result.success).toBe(false);
  });

  it('rejects true_false question if options count is not exactly 2', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Is the earth flat?',
      type: 'true_false',
      options: ['True'],
      correctAnswer: 'True',
    });
    expect(result.success).toBe(false);
  });

  it('rejects true_false question if correctAnswer is not in options', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Is the earth flat?',
      type: 'true_false',
      options: ['True', 'False'],
      correctAnswer: 'Maybe',
    });
    expect(result.success).toBe(false);
  });

  it('rejects open_ended question if options are provided', () => {
    const result = trainingQuestionAdminSchema.safeParse({
      question: 'Describe our culture',
      type: 'open_ended',
      options: ['Good', 'Bad'],
      correctAnswer: 'It is good.',
    });
    expect(result.success).toBe(false);
  });

  // ─── reorderTrainingModulesSchema ───
  it('rejects duplicate module IDs in reorder schema', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const result = reorderTrainingModulesSchema.safeParse({ moduleIds: [id, id] });
    expect(result.success).toBe(false);
  });

  it('accepts valid reorder schema', () => {
    const result = reorderTrainingModulesSchema.safeParse({
      moduleIds: [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
      ],
    });
    expect(result.success).toBe(true);
  });

  // ─── generatedTrainingModulesSchema ───
  it('rejects empty modules in generatedTrainingModulesSchema wrapper', () => {
    const result = generatedTrainingModulesSchema.safeParse({ modules: [] });
    expect(result.success).toBe(false);
  });

  it('rejects direct array in generatedTrainingModulesSchema', () => {
    const result = generatedTrainingModulesSchema.safeParse([
      {
        title: 'Module 1',
        sections: [{ title: 'Intro', body: 'Some content here...', keyPoints: ['p1'] }],
        evaluationEnabled: false,
        evaluationQuestions: [],
        sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
      },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects generated module with evaluationEnabled but zero questions', () => {
    const result = generatedTrainingModuleSchema.safeParse({
      title: 'Module 1',
      sections: [{ title: 'Intro', body: 'Some content...', keyPoints: ['p1'] }],
      evaluationEnabled: true,
      evaluationQuestions: [],
      sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects generated module with evaluationEnabled: false but non-empty questions', () => {
    const result = generatedTrainingModuleSchema.safeParse({
      title: 'Module 1',
      sections: [{ title: 'Intro', body: 'Some content...', keyPoints: ['p1'] }],
      evaluationEnabled: false,
      evaluationQuestions: [
        {
          question: 'What is that?',
          type: 'open_ended',
          correctAnswer: 'Answer',
        },
      ],
      sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects generated module with invalid UUID source documents', () => {
    const result = generatedTrainingModuleSchema.safeParse({
      title: 'Module 1',
      sections: [{ title: 'Intro', body: 'Some content...', keyPoints: ['p1'] }],
      evaluationEnabled: false,
      evaluationQuestions: [],
      sourceDocumentIds: ['invalid-uuid-doc'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid generated module wrapper', () => {
    const result = generatedTrainingModulesSchema.safeParse({
      modules: [
        {
          title: 'Module 1',
          sections: [{ title: 'Intro', body: 'Some content here...', keyPoints: ['p1'] }],
          evaluationEnabled: false,
          evaluationQuestions: [],
          sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  // ─── openEndedGradingSchema ───
  it('validates openEndedGradingSchema structure', () => {
    const result = openEndedGradingSchema.safeParse({
      evaluations: [
        { index: 0, correct: true, explanation: 'Correct because...' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects openEndedGradingSchema with missing explanation', () => {
    const result = openEndedGradingSchema.safeParse({
      evaluations: [{ index: 0, correct: true }],
    });
    expect(result.success).toBe(false);
  });

  // ─── evaluateTrainingModuleSchema ───
  it('rejects evaluate schema with no answers', () => {
    const result = evaluateTrainingModuleSchema.safeParse({
      moduleId: '00000000-0000-4000-8000-000000000001',
      answers: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects manual module with more than 20 questions', () => {
    const questions = Array.from(
      { length: 21 },
      (_, index) => ({
        question: `Question ${index}`,
        type: 'open_ended' as const,
        correctAnswer: `Answer ${index}`,
      })
    );

    const result =
      manualTrainingModuleSchema.safeParse({
        title: 'Module',
        content: {
          sections: [
            {
              title: 'Section',
              body: 'Body',
              keyPoints: ['Point'],
            },
          ],
        },
        durationEstimate: 30,
        evaluationEnabled: true,
        evaluationQuestions: questions,
        sourceDocumentIds: [],
      });

    expect(result.success).toBe(false);
  });
});
