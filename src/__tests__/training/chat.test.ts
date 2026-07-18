import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../app/api/training/chat/route';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: () => FluentMock;
  eq: () => FluentMock;
  in: () => FluentMock;
  is: () => FluentMock;
  limit: () => FluentMock;
  textSearch: () => FluentMock;
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    in: () => fluent,
    is: () => fluent,
    limit: () => fluent,
    textSearch: () => fluent,
    maybeSingle: async () => resolvedValue,
    single: async () => resolvedValue,
    then: (resolve) => Promise.resolve(resolvedValue).then(resolve),
  };
  return fluent;
};

let mockModuleResult: unknown = null;
let mockProgressResult: unknown = null;
let mockModuleDocsResult: unknown = null;
let mockSessionResult: unknown = null;
let mockOrgResult: unknown = { name: 'Test Org' };

const mockFrom = vi.fn();

const defaultMockFrom = (table: string) => {
  if (table === 'training_modules') {
    return createFluentMock({ data: mockModuleResult, error: null });
  }
  if (table === 'training_progress') {
    return createFluentMock({ data: mockProgressResult, error: null });
  }
  if (table === 'training_module_documents') {
    return createFluentMock({ data: mockModuleDocsResult, error: null });
  }
  if (table === 'training_sessions') {
    return createFluentMock({ data: mockSessionResult, error: null });
  }
  return createFluentMock({ data: mockOrgResult, error: null });
};

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

// Mock external fetch for OpenRouter
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Training Chat Endpoint (/api/training/chat)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockFrom).mockImplementation(defaultMockFrom);
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
    mockModuleResult = {
      id: '00000000-0000-4000-8000-000000000001',
      title: 'Module Title',
      content: { sections: [] },
      program_id: 'prog-333',
    };
    mockProgressResult = null;
    mockModuleDocsResult = null;
    mockSessionResult = null;
    mockOrgResult = { name: 'Test Org' };
  });

  it('returns 400 for invalid action or format parameters', async () => {
    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({ mode: 'general', action: 'invalid' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 403 if target module is locked or not found for module mode', async () => {
    // mock locked progress status
    mockProgressResult = { status: 'locked' };

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'module',
        moduleId: '00000000-0000-4000-8000-000000000001',
        action: 'start',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Module is locked');
  });

  it('returns 500 if database query for progress fails', async () => {
    // Simulate database failure by returning error object
    const mockFromError = vi.fn((table: string) => {
      if (table === 'training_progress') {
        return createFluentMock({ data: null, error: { message: 'Database error', code: 'P0001' } });
      }
      if (table === 'training_modules') {
        return createFluentMock({ data: mockModuleResult, error: null });
      }
      return createFluentMock({ data: null, error: null });
    });

    vi.mocked(mockFrom).mockImplementation(mockFromError);

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'module',
        moduleId: '00000000-0000-4000-8000-000000000001',
        action: 'start',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not load training context');
  });

  it('returns 500 if RPC message append fails', async () => {
    mockProgressResult = { status: 'in_progress' };
    mockSessionResult = { id: 'sess-1', messages: [] };
    
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC Failure', code: 'P0002' },
    });

    // Mock openrouter success response
    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              message: 'Hello, how can I help you today?',
              type: 'text',
              citationChunkIds: [],
            }),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAiResponse,
    });

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'module',
        moduleId: '00000000-0000-4000-8000-000000000001',
        message: 'Hello tutor',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not save the training conversation');
  });

  it('accommodates RAG search and formats messages correctly', async () => {
    mockProgressResult = { status: 'in_progress' };
    mockSessionResult = { id: 'sess-1', messages: [] };
    mockModuleDocsResult = []; // Mock empty documents list

    mockRpc.mockResolvedValueOnce({
      data: [{ role: 'user', content: 'Hello', timestamp: Date.now() }],
      error: null,
    });

    // Mock openrouter success response
    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              message: 'Hello, how can I help you today?',
              type: 'text',
              citationChunkIds: [],
            }),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAiResponse,
    });

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'module',
        moduleId: '00000000-0000-4000-8000-000000000001',
        message: 'Hello',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.message).toBe('Hello, how can I help you today?');
  });
});
