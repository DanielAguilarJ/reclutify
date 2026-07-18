import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../app/api/training/generate-modules/route';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: () => FluentMock;
  eq: () => FluentMock;
  order: () => FluentMock;
  single: () => Promise<unknown>;
  maybeSingle: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    order: () => fluent,
    single: async () => resolvedValue,
    maybeSingle: async () => resolvedValue,
    then: (resolve) => Promise.resolve(resolvedValue).then(resolve),
  };
  return fluent;
};

interface MockProgram {
  id: string;
  org_id: string;
  status: string;
  title: string;
}

interface MockUser {
  id: string;
}

let mockProgram: MockProgram = { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-1', status: 'draft', title: 'Culture Program' };
let mockUser: MockUser = { id: 'usr-1' };
let mockAssociationsResult: unknown[] = [];
let mockOrgResult: unknown = { name: 'Test Org' };
let mockOrgError: unknown = null;

const mockFrom = vi.fn((table: string) => {
  if (table === 'training_program_documents') {
    return createFluentMock({ data: mockAssociationsResult, error: null });
  }
  if (table === 'organizations') {
    return createFluentMock({ data: mockOrgResult, error: mockOrgError });
  }
  return createFluentMock({ data: null, error: null });
});

const mockRpc = vi.fn();

vi.mock('@/lib/training/auth', () => ({
  requireProgramAdmin: async () => ({
    program: mockProgram,
    admin: {
      from: mockFrom,
      rpc: mockRpc,
    },
    user: mockUser,
  }),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Generate Modules Endpoint (/api/training/generate-modules)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENROUTER_API_KEY = 'mock-key';
    mockProgram = { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-1', status: 'draft', title: 'Culture Program' };
    mockUser = { id: 'usr-1' };
    mockAssociationsResult = [];
    mockOrgResult = { name: 'Test Org' };
    mockOrgError = null;
  });

  it('returns 502 if AI returns array without wrapper', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockAssociationsResult = [
      {
        training_documents: {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'ready',
          extracted_text: 'Document context content.',
        },
      },
    ];

    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify([
              {
                title: 'AI Module',
                description: 'Content description',
                sections: [{ title: 'Sec 1', body: 'Body 1', keyPoints: ['Pt 1'] }],
                evaluationEnabled: false,
                evaluationQuestions: [],
                sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
              },
            ]),
          },
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAiResponse,
    });

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({ programId: '00000000-0000-4000-8000-000000000001' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('AI returned invalid module structure');
  });

  it('returns 502 if AI cites unauthorized document ID', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockAssociationsResult = [
      {
        training_documents: {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'ready',
          extracted_text: 'Document context content.',
        },
      },
    ];

    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              modules: [
                {
                  title: 'AI Module',
                  description: 'Content description',
                  sections: [{ title: 'Sec 1', body: 'Body 1', keyPoints: ['Pt 1'] }],
                  evaluationEnabled: false,
                  evaluationQuestions: [],
                  sourceDocumentIds: ['00000000-0000-4000-8000-000000000999'],
                },
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

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({ programId: '00000000-0000-4000-8000-000000000001' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('AI returned an unauthorized source document');
  });

  it('limits prompt context to 20 documents even when 21 are associated', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockAssociationsResult = Array.from({ length: 21 }, (_, i) => ({
      training_documents: {
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        status: 'ready',
        extracted_text: `Text ${i}`,
      },
    }));

    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              modules: [
                {
                  title: 'AI Module',
                  description: 'Content description',
                  sections: [{ title: 'Sec 1', body: 'Body 1', keyPoints: ['Pt 1'] }],
                  evaluationEnabled: false,
                  evaluationQuestions: [],
                  sourceDocumentIds: ['00000000-0000-4000-8000-000000000000'],
                },
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

    mockRpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({ programId: '00000000-0000-4000-8000-000000000001' }),
    });

    await POST(req);

    expect(mockFetch).toHaveBeenCalled();
    const fetchArgs = mockFetch.mock.calls[0];
    const bodyObj = JSON.parse(fetchArgs[1].body);
    const messages = bodyObj.messages;

    const userMessage = messages[1].content;
    expect(userMessage).toContain('00000000-0000-4000-8000-000000000019'); // 20th doc
    expect(userMessage).not.toContain('00000000-0000-4000-8000-000000000020'); // 21st doc (omitted)
  });

  it('returns 500 when organization query fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockAssociationsResult = [
      {
        training_documents: {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'ready',
          extracted_text: 'Text',
        },
      },
    ];

    mockOrgResult = null;
    mockOrgError = { message: 'Database timeout', code: '57014' };

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({ programId: '00000000-0000-4000-8000-000000000001' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not load organization context');
  });

  it('returns generic error and does not leak rpcError.message on replace error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mockAssociationsResult = [
      {
        training_documents: {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'ready',
          extracted_text: 'Text',
        },
      },
    ];

    const mockAiResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              modules: [
                {
                  title: 'AI Module',
                  description: 'Content description',
                  sections: [{ title: 'Sec 1', body: 'Body 1', keyPoints: ['Pt 1'] }],
                  evaluationEnabled: false,
                  evaluationQuestions: [],
                  sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'],
                },
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

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Trigger restriction violated', code: 'P0003' },
    });

    const req = new NextRequest('http://localhost/api/training/generate-modules', {
      method: 'POST',
      body: JSON.stringify({ programId: '00000000-0000-4000-8000-000000000001' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not persist generated modules');
  });
});
