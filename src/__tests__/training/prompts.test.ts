import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as postChat } from '@/app/api/training/chat/route';
import { POST as postGenerate } from '@/app/api/training/generate-modules/route';
import { POST as postHire } from '@/app/api/training/hire-candidate/route';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: (cols?: string) => FluentMock;
  eq: (col: string, val: unknown) => FluentMock;
  in: (col: string, vals: unknown[]) => FluentMock;
  is: (col: string, val: unknown) => FluentMock;
  limit: (n: number) => FluentMock;
  order: (col: string, opt?: unknown) => FluentMock;
  textSearch: (col: string, val: unknown) => FluentMock;
  maybeSingle: () => Promise<any>;
  single: () => Promise<any>;
  then: (resolve: (val: any) => any) => Promise<any>;
}

const createFluentMock = (resolvedValue: any, errorValue: any = null): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    in: () => fluent,
    is: () => fluent,
    limit: () => fluent,
    order: () => fluent,
    textSearch: () => fluent,
    maybeSingle: async () => ({ data: resolvedValue, error: errorValue }),
    single: async () => ({ data: resolvedValue, error: errorValue }),
    then: (resolve) => Promise.resolve({ data: resolvedValue, error: errorValue }).then(resolve),
  };
  return fluent;
};

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockRpc = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === 'users') {
    return createFluentMock({ id: 'usr-111', role: 'admin' });
  }
  if (table === 'organizations') {
    return createFluentMock({ id: 'org-222', name: 'Company Name' });
  }
  if (table === 'training_employees') {
    return createFluentMock({
      id: '00000000-0000-4000-8000-000000000009',
      name: 'Candidate Hired',
      role_title: 'Developer',
      interview_data: { evaluation: 'Excellent interview' },
    });
  }
  if (table === 'training_sessions') {
    return createFluentMock({
      id: 'session-111',
      employee_id: 'emp-111',
      messages: [],
    });
  }
  if (table === 'training_programs') {
    return createFluentMock({
      id: '00000000-0000-4000-8000-000000000001',
      org_id: 'org-222',
      title: 'Program Title',
      status: 'draft',
      welcome_message: 'welcome',
      ai_personality: 'friendly_mentor',
    });
  }
  if (table === 'training_program_documents') {
    return createFluentMock([
      {
        training_documents: {
          id: 'doc-111',
          file_name: 'doc1.txt',
          extracted_text: 'Document content is safe and long enough to qualify as a valid training document',
          status: 'ready',
        },
      },
    ]);
  }
  if (table === 'training_document_chunks') {
    return createFluentMock([
      {
        id: 'chunk-111',
        content: 'RAG context snippet that is safe',
        document_id: 'doc-111',
      },
    ]);
  }
  return createFluentMock(null);
});

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

vi.mock('@/lib/training/session', () => ({
  getTrainingEmployeeFromSession: async () => ({
    id: 'emp-111',
    name: 'Employee Name',
    org_id: 'org-222',
    program_id: '00000000-0000-4000-8000-000000000001',
    role_id: 'role-333',
    role_title: 'Software Developer',
    personalization_notes: {},
  }),
}));

vi.mock('@/lib/training/auth', () => ({
  requireProgramAdmin: async () => ({
    program: { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-222', status: 'draft', title: 'Program Title' },
    admin: {
      from: mockFrom,
      rpc: mockRpc,
    },
    user: { id: 'usr-111' },
  }),
  requireAuthenticatedUser: async () => ({
    id: 'usr-111',
    admin: {
      from: mockFrom,
      rpc: mockRpc,
    },
  }),
}));

describe('Prompts Delimiter Validation tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'mock-key';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost';
    mockRpc.mockResolvedValue({ data: [], error: null });
  });

  it('chat endpoint prompt contains UNTRUSTED delimiters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ message: 'Hello', type: 'text' }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/chat', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'general',
        message: 'Hi Zara',
      }),
    });

    const res = await postChat(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchArgs[1].body);
    const systemPrompt = fetchBody.messages[0].content;

    expect(systemPrompt).toContain('<UNTRUSTED_PERSON_CONTEXT>');
    expect(systemPrompt).toContain('</UNTRUSTED_PERSON_CONTEXT>');
    expect(systemPrompt).toContain('<UNTRUSTED_MODULE_CONTENT>');
    expect(systemPrompt).toContain('</UNTRUSTED_MODULE_CONTENT>');
    expect(systemPrompt).toContain('<UNTRUSTED_RAG_CONTEXT>');
    expect(systemPrompt).toContain('</UNTRUSTED_RAG_CONTEXT>');
  });

  it('generate-modules endpoint prompt contains UNTRUSTED delimiters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ modules: [] }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({
        programId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    await postGenerate(req);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchArgs[1].body);
    const userPrompt = fetchBody.messages[1].content;

    expect(userPrompt).toContain('<UNTRUSTED_PROGRAM_METADATA>');
    expect(userPrompt).toContain('</UNTRUSTED_PROGRAM_METADATA>');
    expect(userPrompt).toContain('<UNTRUSTED_DOCUMENT_CONTENT>');
    expect(userPrompt).toContain('</UNTRUSTED_DOCUMENT_CONTENT>');
  });

  it('hire-candidate endpoint prompt contains UNTRUSTED delimiters', async () => {
    mockRpc.mockResolvedValueOnce({
      data: '00000000-0000-4000-8000-000000000009',
      error: null,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ strengths: [], areasToWatch: [], learningStyle: 'Read', customTips: [] }) } }],
      }),
    });

    const req = new NextRequest('http://localhost/api/training/hire-candidate', {
      method: 'POST',
      body: JSON.stringify({
        candidateResultId: '00000000-0000-4000-8000-000000000008',
        programId: '00000000-0000-4000-8000-000000000001',
      }),
    });

    const res = await postHire(req);
    expect(res.status).toBe(200);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const fetchBody = JSON.parse(fetchArgs[1].body);
    const userPrompt = fetchBody.messages[1].content;

    expect(userPrompt).toContain('<UNTRUSTED_EMPLOYEE_CONTEXT>');
    expect(userPrompt).toContain('</UNTRUSTED_EMPLOYEE_CONTEXT>');
  });
});
