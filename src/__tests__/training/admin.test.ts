import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH as patchModule } from '../../app/api/training/programs/[programId]/modules/[moduleId]/route';
import { PATCH as patchReorder } from '../../app/api/training/programs/[programId]/modules/reorder/route';
import { DELETE as deleteDocument } from '../../app/api/training/programs/[programId]/documents/route';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: () => FluentMock;
  eq: () => FluentMock;
  in: () => FluentMock;
  limit: () => FluentMock;
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
let mockProgressResult: unknown[] = [];

const mockFrom = vi.fn((table: string) => {
  if (table === 'training_progress') {
    return createFluentMock(mockProgressResult);
  }
  if (table === 'training_program_documents') {
    return createFluentMock({ data: [], error: null });
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
    mockProgressResult = [];
  });

  // ─── PATCH Module Manual ───
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

    // Invalid body (e.g. title is empty string)
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

  // ─── PATCH Module Reorder ───
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
          '00000000-0000-4000-8000-000000000001', // duplicate
        ],
      }),
    });

    const params = Promise.resolve({ programId: 'prog-1' });
    const res = await patchReorder(req, { params });
    expect(res.status).toBe(400);
  });

  it('PATCH reorder returns 400 with incomplete or extra module IDs', async () => {
    mockModulesResult = [
      { id: '00000000-0000-4000-8000-000000000001', sortOrder: 0 },
      { id: '00000000-0000-4000-8000-000000000002', sortOrder: 1 },
    ];

    const req = new NextRequest('http://localhost/api/training/programs/prog-1/modules/reorder', {
      method: 'PATCH',
      body: JSON.stringify({
        moduleIds: [
          '00000000-0000-4000-8000-000000000001', // missing id 2
        ],
      }),
    });

    const params = Promise.resolve({ programId: 'prog-1' });
    const res = await patchReorder(req, { params });
    expect(res.status).toBe(400);
    const data = await res.json() as Record<string, unknown>;
    expect(data.error).toBe('moduleIds must contain every program module exactly once');
  });

  // ─── DELETE Program Document ───
  it('DELETE program document returns 409 if document is in use by modules', async () => {
    // Mock RPC returning training_document_in_use error code or message
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
});
