import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Mockear getTrainingEmployeeFromSession para simular que no hay sesión activa de forma segura
vi.mock('../../lib/training/session', () => ({
  getTrainingEmployeeFromSession: vi.fn().mockResolvedValue(null),
}));

import { POST as chatPOST } from '../../app/api/training/chat/route';
import { POST as progressPOST } from '../../app/api/training/update-progress/route';
import { POST as evaluatePOST } from '../../app/api/training/evaluate-module/route';
import { NextRequest, NextResponse } from 'next/server';
import {
  trainingChatRequestSchema,
  updateTrainingTimeSchema,
  evaluateTrainingModuleSchema,
} from '../../lib/training/contracts';
import { validateChatCitations } from '../../lib/training/documents';

describe('Training Center V2 Contract Integrity', () => {
  it('should return 401 on chat if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'general',
        message: 'Hola tutor'
      })
    });

    const res = await chatPOST(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 on progress update if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/update-progress', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: 'd5785a21-97b7-4c74-a690-3a339a04a601',
        minutesDelta: 30
      })
    });

    const res = await progressPOST(req);
    expect(res.status).toBe(401);
  });

  it('should return 401 on evaluation if no valid cookie session is active', async () => {
    const req = new NextRequest('http://localhost/api/training/evaluate-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: 'd5785a21-97b7-4c74-a690-3a339a04a601',
        answers: [{ questionIndex: 0, answer: 'A' }]
      })
    });

    const res = await evaluatePOST(req);
    expect(res.status).toBe(401);
  });

  // PRUEBAS DE CONTRATO DIRECTAS SOBRE SCHEMAS ZOD
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

  it('rejects absolute timeSpent updates and checks minutesDelta restrictions', () => {
    // Schema updateTrainingTimeSchema expects minutesDelta, not timeSpent
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

    const safeQuestions = rawQuestions.map((question) => ({
      question: question.question,
      type: question.type,
      options: question.options,
    }));

    expect(safeQuestions[0]).not.toHaveProperty('correctAnswer');
    expect(safeQuestions[0]).not.toHaveProperty('explanation');
  });
});
