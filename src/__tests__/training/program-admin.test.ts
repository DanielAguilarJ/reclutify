import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PATCH } from '@/app/api/training/programs/[programId]/route';
import { POST as postPublish } from '@/app/api/training/programs/[programId]/publish/route';
import { POST as postVersion } from '@/app/api/training/programs/[programId]/versions/route';

vi.mock('server-only', () => ({}));

interface FluentMock {
  select: () => FluentMock;
  eq: () => FluentMock;
  update: (obj: unknown) => FluentMock;
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    update: () => fluent,
    maybeSingle: async () => ({ data: resolvedValue, error: null }),
    single: async () => ({ data: resolvedValue, error: null }),
    then: (resolve) => Promise.resolve({ data: resolvedValue, error: null }).then(resolve),
  };
  return fluent;
};

let mockProgram: Record<string, unknown> = { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-222', status: 'draft' };
const mockRpc = vi.fn();
const mockFrom = vi.fn((table: string) => {
  if (table === 'training_programs') {
    return createFluentMock(null);
  }
  return createFluentMock(null);
});

vi.mock('@/lib/training/auth', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    requireProgramAdmin: async (programId: string) => {
      // Validate UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(programId)) {
        throw new actual.TrainingAuthError('Invalid training program ID', 400);
      }
      return {
        program: mockProgram,
        admin: {
          from: mockFrom,
          rpc: mockRpc,
        },
        user: { id: 'usr-111' },
      };
    },
  };
});

describe('Program Administrative Actions Endpoint Tests', () => {
  beforeEach(() => {
    mockRpc.mockReset();
    vi.clearAllMocks();
    mockProgram = { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-222', status: 'draft' };
  });

  it('PATCH program returns 409 if status is not draft initially', async () => {
    mockProgram.status = 'published';

    const req = new NextRequest('http://localhost/api/training/programs/00000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ programId: '00000000-0000-4000-8000-000000000001' }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Create a new program version before editing');
  });

  it('PATCH program returns 409 if status changed to published concurrently (update returns null)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // mock update returns null (because program was published concurrently and .eq('status', 'draft') filters it out)
    mockFrom.mockImplementationOnce(() => createFluentMock(null) as unknown as FluentMock);

    const req = new NextRequest('http://localhost/api/training/programs/00000000-0000-4000-8000-000000000001', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'New title' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ programId: '00000000-0000-4000-8000-000000000001' }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Program is no longer editable as a draft');
  });

  it('publish returns 400 when programId is invalid', async () => {
    const req = new NextRequest('http://localhost/api/training/programs/invalid-id/publish', {
      method: 'POST',
    });

    const res = await postPublish(req, { params: Promise.resolve({ programId: 'invalid-id' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid training program ID');
  });

  it('versions returns 400 when programId is invalid', async () => {
    const req = new NextRequest('http://localhost/api/training/programs/invalid-id/versions', {
      method: 'POST',
    });

    const res = await postVersion(req, { params: Promise.resolve({ programId: 'invalid-id' }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid training program ID');
  });
});
