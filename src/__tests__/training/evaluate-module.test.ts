import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../app/api/training/evaluate-module/route';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: () => FluentMock;
  eq: () => FluentMock;
  single: () => Promise<unknown>;
  maybeSingle: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    single: async () => resolvedValue,
    maybeSingle: async () => resolvedValue,
    then: (resolve) => Promise.resolve(resolvedValue).then(resolve),
  };
  return fluent;
};

let mockModuleData: unknown = null;
const mockFrom = vi.fn((table: string) => {
  if (table === 'training_modules') {
    return createFluentMock({ data: mockModuleData, error: null });
  }
  return createFluentMock({ data: null, error: null });
});

const mockRpc = vi.fn();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

interface MockEmployee {
  id: string;
  name: string;
  org_id: string;
  program_id: string;
  role_id: string;
  role_title: string;
  personalization_notes: Record<string, unknown>;
}

let mockEmployee: MockEmployee = {
  id: 'emp-111',
  name: 'John Doe',
  org_id: 'org-222',
  program_id: 'prog-333',
  role_id: 'role-444',
  role_title: 'Software Developer',
  personalization_notes: {},
};

vi.mock('@/lib/training/session', () => ({
  getTrainingEmployeeFromSession: async () => mockEmployee,
}));

// Mock fetch global for OpenRouter
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Evaluate Module Endpoint (/api/training/evaluate-module)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'mock-key';
    mockEmployee = {
      id: 'emp-111',
      name: 'John Doe',
      org_id: 'org-222',
      program_id: 'prog-333',
      role_id: 'role-444',
      role_title: 'Software Developer',
      personalization_notes: {},
    };
    mockModuleData = null;
  });

  it('returns 502 if AI returns duplicate index during open ended evaluation', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockModuleData = {
      id: '00000000-0000-4000-8000-000000000001',
      evaluation_enabled: true,
      evaluation_questions: [
        { question: 'Q1', type: 'open_ended', correctAnswer: 'A1' },
      ],
    };

    mockRpc.mockResolvedValueOnce({
      data: {
        score: 0,
        passed: false,
        passing_score: 70,
        attempts: 1,
        overall_progress: 10,
        overall_score: 0,
        feedback: { details: [] },
      },
      error: null,
    });

    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              evaluations: [
                { index: 0, correct: true, explanation: 'Good answer' },
                { index: 0, correct: false, explanation: 'Duplicate index' },
              ],
            }),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAiResponse,
    });

    const req = new NextRequest('http://localhost/api/training/evaluate-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
        answers: [{ questionIndex: 0, answer: 'My answer' }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('AI grading returned inconsistent question indexes');
  });

  it('returns 502 if AI returns missing indexes', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockModuleData = {
      id: '00000000-0000-4000-8000-000000000001',
      evaluation_enabled: true,
      evaluation_questions: [
        { question: 'Q1', type: 'open_ended', correctAnswer: 'A1' },
      ],
    };

    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              evaluations: [], // empty evaluations
            }),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAiResponse,
    });

    const req = new NextRequest('http://localhost/api/training/evaluate-module', {
      method: 'POST',
      body: JSON.stringify({
        moduleId: '00000000-0000-4000-8000-000000000001',
        answers: [{ questionIndex: 0, answer: 'My answer' }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('AI grading returned inconsistent question indexes');
  });
});
