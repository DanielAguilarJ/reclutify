import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH as patchModule } from '../../app/api/training/programs/[programId]/modules/[moduleId]/route';
import { PATCH as patchReorder } from '../../app/api/training/programs/[programId]/modules/reorder/route';
import { DELETE as deleteDocument, POST as postDocument } from '../../app/api/training/programs/[programId]/documents/route';
import { NextRequest } from 'next/server';
import { TrainingAuthError } from '@/lib/training/auth';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: () => FluentMock;
  eq: () => FluentMock;
  in: () => FluentMock;
  limit: () => FluentMock;
  order: () => FluentMock;
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    in: () => fluent,
    limit: () => fluent,
    order: () => fluent,
    maybeSingle: async () => resolvedValue,
    single: async () => resolvedValue,
    then: (resolve) => Promise.resolve(resolvedValue).then(resolve),
  };
  return fluent;
};

interface MockProgram {
  id: string;
  org_id: string;
  status: string;
  title: string;
  role_id: string;
}

interface MockUser {
  id: string;
}

let mockProgram: MockProgram = { id: 'prog-1', org_id: 'org-1', status: 'draft', title: 'Culture Program', role_id: 'role-1' };
let mockUser: MockUser = { id: 'usr-1' };
let mockModulesResult: unknown[] = [];
let mockProgressResult: unknown = { data: [], error: null };
let mockAssociationsResult: unknown = { data: [], error: null };

const mockFrom = vi.fn((table: string) => {
  if (table === 'training_progress') {
    return createFluentMock(mockProgressResult);
  }
  if (table === 'training_program_documents') {
    return createFluentMock(mockAssociationsResult);
  }
  return createFluentMock({ data: null, error: null });
});

const mockRpc = vi.fn();

let mockAuthError: Error | null = null;

vi.mock('@/lib/training/auth', () => ({
  TrainingAuthError: class extends Error {
    constructor(message: string, public status: number) {
      super(message);
      this.name = 'TrainingAuthError';
    }
  },
  requireProgramAdmin: async () => {
    if (mockAuthError) {
      throw mockAuthError;
    }
    return {
      program: mockProgram,
      admin: {
        from: mockFrom,
        rpc: mockRpc,
      },
      user: mockUser,
    };
  },
}));

vi.mock('@/lib/training/modules', () => ({
  loadDraftModules: async () => mockModulesResult,
  replaceDraftModules: async () => {},
}));

describe('Administrative Endpoints Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgram = { id: 'prog-1', org_id: 'org-1', status: 'draft', title: 'Culture Program', role_id: 'role-1' };
    mockUser = { id: 'usr-1' };
    mockModulesResult = [];
    mockProgressResult = { data: [], error: null };
    mockAssociationsResult = { data: [], error: null };
    mockAuthError = null;
  });

  it('PATCH manual module invalid body returns 400', async () => {
    mockModulesResult = [
      {
        id: 'mod-111',
        title: 'Original Title',
        content: { sections: [{ title: 'Intro', body: 'Some body text...', keyPoints: ['pt1'] }] },
        durationEstimate: 30,
        evaluationEnabled: false,
        evaluationQuestions: [],
        sourceDocumentIds: [],
      },
    ];

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/mod-111', {
      method: 'PATCH',
      body: JSON.stringify({
        title: '',
      }),
    });

    const params = Promise.resolve({ programId: 'prog-1', moduleId: 'mod-111' });
    const res = await patchModule(req, { params });
    expect(res.status).toBe(400);
  });

  it('PATCH reorder returns 400 with duplicate module IDs', async () => {
    mockModulesResult = [
      { id: '00000000-0000-4000-8000-000000000001', sortOrder: 0 },
      { id: '00000000-0000-4000-8000-000000000002', sortOrder: 1 },
    ];

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/reorder', {
      method: 'PATCH',
      body: JSON.stringify({
        moduleIds: [
          '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000001',
        ],
      }),
    });

    const params = Promise.resolve({ programId: 'prog-1' });
    const res = await patchReorder(req, { params });
    expect(res.status).toBe(400);
  });

  it('DELETE program document returns 409 if document is in use by modules', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'exception: training_document_in_use', code: 'P0001' },
    });

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/documents?documentId=00000000-0000-4000-8000-000000000001', {
      method: 'DELETE',
    });

    const params = Promise.resolve({ programId: 'prog-1' });
    const res = await deleteDocument(req, { params });
    expect(res.status).toBe(409);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Document is used by one or more modules. Remove it from those modules first.');
  });

  // Nuevos tests del Paso 11
  it('handles TrainingAuthError(401) and returns 401', async () => {
    mockAuthError = new TrainingAuthError('Auth failed', 401);

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ moduleIds: [] }),
    });

    const res = await patchReorder(req, { params: Promise.resolve({ programId: 'prog-1' }) });
    expect(res.status).toBe(401);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Auth failed');
  });

  it('handles TrainingAuthError(403) and returns 403', async () => {
    mockAuthError = new TrainingAuthError('Forbidden access', 403);

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ moduleIds: [] }),
    });

    const res = await patchReorder(req, { params: Promise.resolve({ programId: 'prog-1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 500 when progress query fails', async () => {
    mockModulesResult = [
      { id: 'mod-111', title: 'Title', content: { sections: [] }, durationEstimate: 30, evaluationEnabled: false, evaluationQuestions: [], sourceDocumentIds: [] },
    ];
    mockProgressResult = { data: null, error: { message: 'DB Error', code: 'P0001' } };

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/mod-111', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title' }),
    });

    const res = await patchModule(req, { params: Promise.resolve({ programId: 'prog-1', moduleId: 'mod-111' }) });
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not validate module usage');
  });

  it('returns 500 when associations query fails in manual module PATCH', async () => {
    mockModulesResult = [
      {
        id: 'mod-111',
        title: 'Title',
        content: {
          sections: [{ title: 'Section 1', body: 'Body 1', keyPoints: ['Point 1'] }],
        },
        durationEstimate: 30,
        evaluationEnabled: false,
        evaluationQuestions: [],
        sourceDocumentIds: [],
      },
    ];
    mockProgressResult = { data: [], error: null };
    mockAssociationsResult = { data: null, error: { message: 'Database Connection Fail', code: '08006' } };

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/mod-111', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New Title', sourceDocumentIds: ['00000000-0000-4000-8000-000000000001'] }),
    });

    const res = await patchModule(req, { params: Promise.resolve({ programId: 'prog-1', moduleId: 'mod-111' }) });
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not validate module documents');
  });

  it('returns 500 when sort_order query fails in document attachment', async () => {
    // Para simular la falla de maxAssocError
    const mockDocumentSelectResult = {
      data: { id: 'doc-123', scope: 'organization', status: 'ready' },
      error: null,
    };
    mockAssociationsResult = {
      data: null,
      error: { message: 'Sort query timeout', code: '57014' },
    };

    const customFrom = vi.fn((table: string) => {
      if (table === 'training_documents') {
        return createFluentMock(mockDocumentSelectResult);
      }
      if (table === 'training_program_documents') {
        return createFluentMock(mockAssociationsResult);
      }
      return createFluentMock({ data: null, error: null });
    });

    vi.mocked(mockFrom).mockImplementation(customFrom);

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/documents', {
      method: 'POST',
      body: JSON.stringify({ documentId: '00000000-0000-4000-8000-000000000001', required: true }),
    });

    const res = await postDocument(req, { params: Promise.resolve({ programId: 'prog-1' }) });
    expect(res.status).toBe(500);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('Could not determine document order');
  });
});
