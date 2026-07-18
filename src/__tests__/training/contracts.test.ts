import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mockear getTrainingEmployeeFromSession para simular que no hay sesión activa
vi.mock('../../lib/training/session', () => ({
  getTrainingEmployeeFromSession: vi.fn().mockResolvedValue(null),
}));

import { POST as chatPOST } from '../../app/api/training/chat/route';
import { POST as progressPOST } from '../../app/api/training/update-progress/route';
import { POST as evaluatePOST } from '../../app/api/training/evaluate-module/route';
import { POST as startModulePOST } from '../../app/api/training/start-module/route';
import { POST as completeModulePOST } from '../../app/api/training/complete-module/route';
import { NextRequest } from 'next/server';
import {
  trainingChatRequestSchema,
  updateTrainingTimeSchema,
  evaluateTrainingModuleSchema,
  createTrainingProgramSchema,
  updateTrainingProgramSchema,
  attachTrainingDocumentSchema,
  manualTrainingModuleSchema,
  reorderTrainingModulesSchema,
  trainingAccessSchema,
  generatedTrainingModulesSchema,
  openEndedGradingSchema,
} from '../../lib/training/contracts';
import { validateChatCitations } from '../../lib/training/documents';
import { sanitizePublicQuestions } from '../../lib/training/bootstrap';

describe('Training Center V2 Contract Integrity', () => {
  // ─── Guard 401 ───
  it('should return 401 on chat if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({ mode: 'general', message: 'Hola tutor' }),
    });
    const res = await chatPOST(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 on progress update if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/update-progress', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: 'd5785a21-97b7-4c74-a690-3a339a04a601',
        minutesDelta: 30,
      }),
    });
    const res = await progressPOST(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 on evaluation if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/evaluate-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: 'd5785a21-97b7-4c74-a690-3a339a04a601',
        answers: [{ questionIndex: 0, answer: 'A' }],
      }),
    });
    const res = await evaluatePOST(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 on start-module if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/start-module', {
      method: 'POST',
      body: JSON.stringify({ moduleId: 'd5785a21-97b7-4c74-a690-3a339a04a601' }),
    });
    const res = await startModulePOST(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 on complete-module if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/complete-module', {
      method: 'POST',
      body: JSON.stringify({ moduleId: 'd5785a21-97b7-4c74-a690-3a339a04a601' }),
    });
    const res = await completeModulePOST(req);
    expect(res.status).toBe(401);
  });

  // ─── Chat Zod Schema ───
  it('rejects employeeId and messages in chat body', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'general',
      message: 'hola',
      employeeId: 'forged-id-xyz',
      messages: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid module chat message', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'module',
      moduleId: '00000000-0000-4000-8000-000000000001',
      message: '¿Cómo funciona esto?',
    });
    expect(result.success).toBe(true);
  });

  it('rejects mode:module without moduleId', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'module',
      message: 'hola',
    });
    expect(result.success).toBe(false);
  });

  it('rejects both action:start and message in same request', () => {
    const result = trainingChatRequestSchema.safeParse({
      mode: 'general',
      action: 'start',
      message: 'hola',
    });
    expect(result.success).toBe(false);
  });

  // ─── Time Delta Schema ───
  it('rejects absolute timeSpent updates and checks minutesDelta restrictions', () => {
    const result = updateTrainingTimeSchema.safeParse({
      moduleId: '00000000-0000-4000-8000-000000000001',
      timeSpent: 500,
    });
    expect(result.success).toBe(false);

    const result2 = updateTrainingTimeSchema.safeParse({
      moduleId: '00000000-0000-4000-8000-000000000001',
      minutesDelta: 500, // Excede el max de 60
    });
    expect(result2.success).toBe(false);
  });

  it('accepts valid time delta', () => {
    const result = updateTrainingTimeSchema.safeParse({
      moduleId: '00000000-0000-4000-8000-000000000001',
      minutesDelta: 15,
    });
    expect(result.success).toBe(true);
  });

  // ─── Citations ───
  it('validates citations purely with fake IDs', () => {
    const fakeAvailableChunks = [
      {
        id: 'chunk-1',
        document_id: 'doc-100',
        content: 'This is the source content of doc-100 chunk.',
        training_documents: { file_name: 'doc100.pdf' },
        chunk_index: 0,
      },
    ];

    const citations = validateChatCitations(['chunk-1', 'invalid-chunk-id'], fakeAvailableChunks);
    expect(citations).toHaveLength(1);
    expect(citations[0].documentId).toBe('doc-100');
    expect(citations[0].fileName).toBe('doc100.pdf');
    expect(citations[0].snippet).toBe('This is the source content of doc-100 chunk.');
  });

  it('returns empty citations when none match', () => {
    const citations = validateChatCitations(['nonexistent'], []);
    expect(citations).toHaveLength(0);
  });

  // ─── Bootstrap sanitization ───
  it('verifies that mock questions from bootstrap filter correctAnswer and explanation', async () => {
    const rawQuestions = [
      {
        question: 'Pregunta 1',
        type: 'multiple_choice',
        options: ['A', 'B'],
        correctAnswer: 'A',
        explanation: 'Esta es la explicacion',
      },
    ];

    const safeQuestions = sanitizePublicQuestions(rawQuestions);

    expect(safeQuestions[0]).not.toHaveProperty('correctAnswer');
    expect(safeQuestions[0]).not.toHaveProperty('explanation');
    expect(safeQuestions[0].question).toBe('Pregunta 1');
    expect(safeQuestions[0].type).toBe('multiple_choice');
  });

  it('sanitizePublicQuestions returns empty array for non-array input', () => {
    const result = sanitizePublicQuestions('invalid');
    expect(result).toHaveLength(0);
  });

  // ─── Training Access Schema ───
  it('rejects short tokens in access schema', () => {
    const result = trainingAccessSchema.safeParse({ token: 'short' });
    expect(result.success).toBe(false);
  });

  it('accepts valid training access token', () => {
    const result = trainingAccessSchema.safeParse({
      token: 'a'.repeat(40),
    });
    expect(result.success).toBe(true);
  });

  // ─── createTrainingProgramSchema ───
  it('rejects invalid aiPersonality in createTrainingProgramSchema', () => {
    const result = createTrainingProgramSchema.safeParse({
      roleId: 'devops-senior',
      title: 'Test Program',
      aiPersonality: 'robot',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid createTrainingProgramSchema', () => {
    const result = createTrainingProgramSchema.safeParse({
      roleId: 'devops-senior',
      title: 'Test Program',
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
    const result = updateTrainingProgramSchema.safeParse({ title: 'New Title' });
    expect(result.success).toBe(true);
  });

  // ─── attachTrainingDocumentSchema ───
  it('rejects invalid document UUID in attach schema', () => {
    const result = attachTrainingDocumentSchema.safeParse({
      documentId: 'not-a-uuid',
      required: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid attach schema', () => {
    const result = attachTrainingDocumentSchema.safeParse({
      documentId: '00000000-0000-4000-8000-000000000001',
      required: true,
    });
    expect(result.success).toBe(true);
  });

  // ─── manualTrainingModuleSchema ───
  it('rejects module without title', () => {
    const result = manualTrainingModuleSchema.safeParse({
      content: { sections: [] },
      durationEstimate: 30,
      evaluationEnabled: false,
      evaluationQuestions: [],
      sourceDocumentIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple_choice question without options', () => {
    const result = manualTrainingModuleSchema.safeParse({
      title: 'Test Module',
      content: { sections: [{ title: 'S1', body: 'Body text here now', keyPoints: ['point1'] }] },
      durationEstimate: 30,
      evaluationEnabled: true,
      evaluationQuestions: [
        {
          question: 'Which is correct?',
          type: 'multiple_choice',
          correctAnswer: 'A',
        },
      ],
      sourceDocumentIds: [],
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
  it('rejects empty array in generatedTrainingModulesSchema', () => {
    const result = generatedTrainingModulesSchema.safeParse([]);
    expect(result.success).toBe(false);
  });

  it('accepts valid generated module array', () => {
    const result = generatedTrainingModulesSchema.safeParse([
      {
        title: 'Module 1',
        sections: [{ title: 'Intro', body: 'Some content here...', keyPoints: ['p1'] }],
        evaluationEnabled: true,
        evaluationQuestions: [],
        sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
      },
    ]);
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
});
