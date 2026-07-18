import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/documents/route';

vi.mock('server-only', () => ({}));

// Mock pdf-parse and mammoth to avoid loading real binaries/files
vi.mock('pdf-parse', () => ({
  default: async () => ({ text: 'Extracted PDF text that is long enough to pass validation rules' }),
}));
vi.mock('mammoth', () => ({
  extractRawText: async () => ({ value: 'Extracted Word text that is long enough to pass validation' }),
}));

interface FluentMock {
  select: (cols?: string) => FluentMock;
  eq: (col: string, val: unknown) => FluentMock;
  is: (col: string, val: unknown) => FluentMock;
  order: (col: string, opt?: unknown) => FluentMock;
  limit: (n: number) => FluentMock;
  maybeSingle: () => Promise<any>;
  single: () => Promise<any>;
  insert: (obj: unknown) => FluentMock;
  delete: () => FluentMock;
  then: (resolve: (val: any) => any) => Promise<any>;
}

const createFluentMock = (resolvedValue: any, errorValue: any = null): FluentMock => {
  const fluent: FluentMock = {
    select: () => fluent,
    eq: () => fluent,
    is: () => fluent,
    order: () => fluent,
    limit: () => fluent,
    maybeSingle: async () => ({ data: resolvedValue, error: errorValue }),
    single: async () => ({ data: resolvedValue, error: errorValue }),
    insert: () => fluent,
    delete: () => fluent,
    then: (resolve) => Promise.resolve({ data: resolvedValue, error: errorValue }).then(resolve),
  };
  return fluent;
};

let mockProgram: unknown = { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-222', status: 'draft', role_id: 'role-333' };
const mockStorageUpload = vi.fn().mockResolvedValue({ error: null });
const mockStorageRemove = vi.fn().mockResolvedValue({ error: null });

const mockDeleteDoc = vi.fn().mockResolvedValue({ error: null });
const mockInsertDoc = vi.fn();
const mockSelectAssoc = vi.fn();
const mockSelectMaxAssoc = vi.fn();
const mockInsertAssoc = vi.fn();

const mockFrom = vi.fn((table: string) => {
  if (table === 'training_documents') {
    const fluent = createFluentMock(null);
    // Custom insert chain for training_documents that handles both maybeSingle and single
    fluent.insert = () => ({
      select: () => ({
        single: mockInsertDoc,
        maybeSingle: mockInsertDoc,
      }),
    } as any);
    // Custom delete chain
    fluent.delete = () => ({
      eq: mockDeleteDoc,
    } as any);
    return fluent;
  }
  if (table === 'training_program_documents') {
    const fluent = createFluentMock(null);
    fluent.select = () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: mockSelectAssoc,
        } as any),
        order: () => ({
          limit: () => ({
            maybeSingle: mockSelectMaxAssoc,
          }),
        }),
      } as any),
    } as any);
    fluent.insert = mockInsertAssoc;
    return fluent;
  }
  return createFluentMock(null);
});

vi.mock('@/lib/training/auth', () => ({
  requireProgramAdmin: async () => ({
    program: mockProgram,
    admin: {
      from: mockFrom,
      storage: {
        from: () => ({
          upload: mockStorageUpload,
          remove: mockStorageRemove,
        }),
      },
    },
  }),
}));

describe('Upload Documents Endpoint Rollbacks (/api/training/documents)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProgram = { id: '00000000-0000-4000-8000-000000000001', org_id: 'org-222', status: 'draft', role_id: 'role-333' };
    process.env.OPENROUTER_API_KEY = ''; // Disable AI call to speed up test and isolate DB

    mockStorageUpload.mockResolvedValue({ error: null });
    mockStorageRemove.mockResolvedValue({ error: null });
    mockDeleteDoc.mockResolvedValue({ error: null });
  });

  it('triggers rollback of document and storage when query for existing association fails', async () => {
    // Mock document insert success
    mockInsertDoc.mockResolvedValueOnce({
      data: {
        id: 'new-doc-id',
        org_id: 'org-222',
        role_id: 'role-333',
        scope: 'role',
        file_name: 'test.txt',
        file_type: 'text/plain',
        storage_path: 'org-222/role-333/new-doc-id/test.txt',
        status: 'ready',
      },
      error: null,
    });

    // Mock existing association query failing
    mockSelectAssoc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database query timeout', code: '57014' },
    });

    const formData = new FormData();
    formData.append('programId', '00000000-0000-4000-8000-000000000001');
    formData.append('scope', 'role');
    const fakeFile = new File(['Some text content that is definitely long enough to qualify as a valid training document content'], 'test.txt', { type: 'text/plain' });
    formData.append('files', fakeFile, 'test.txt');

    const req = new NextRequest('http://localhost/api/training/documents', {
      method: 'POST',
    });
    req.formData = async () => formData;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].error).toBe('Could not process training document');

    // Rollback verifications
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('triggers rollback of document and storage when query for max sort_order fails', async () => {
    // Mock document insert success
    mockInsertDoc.mockResolvedValueOnce({
      data: {
        id: 'new-doc-id',
        org_id: 'org-222',
        role_id: 'role-333',
        scope: 'role',
        file_name: 'test.txt',
        file_type: 'text/plain',
        storage_path: 'org-222/role-333/new-doc-id/test.txt',
        status: 'ready',
      },
      error: null,
    });

    // Mock association lookup returns no association (i.e. we need to create it)
    mockSelectAssoc.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // Mock max sort_order lookup failing
    mockSelectMaxAssoc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Sort order query failed', code: 'P0001' },
    });

    const formData = new FormData();
    formData.append('programId', '00000000-0000-4000-8000-000000000001');
    formData.append('scope', 'role');
    const fakeFile = new File(['Some text content that is definitely long enough to qualify as a valid training document content'], 'test.txt', { type: 'text/plain' });
    formData.append('files', fakeFile, 'test.txt');

    const req = new NextRequest('http://localhost/api/training/documents', {
      method: 'POST',
    });
    req.formData = async () => formData;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].error).toBe('Could not process training document');

    // Rollback verifications
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('triggers rollback of document and storage when inserting program-document association fails', async () => {
    // Mock document insert success
    mockInsertDoc.mockResolvedValueOnce({
      data: {
        id: 'new-doc-id',
        org_id: 'org-222',
        role_id: 'role-333',
        scope: 'role',
        file_name: 'test.txt',
        file_type: 'text/plain',
        storage_path: 'org-222/role-333/new-doc-id/test.txt',
        status: 'ready',
      },
      error: null,
    });

    // Mock association lookup returns no association
    mockSelectAssoc.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    // Mock max sort_order succeeds
    mockSelectMaxAssoc.mockResolvedValueOnce({
      data: { sort_order: 1 },
      error: null,
    });

    // Mock association insert failing
    mockInsertAssoc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Insert constraint violation', code: '23503' },
    });

    const formData = new FormData();
    formData.append('programId', '00000000-0000-4000-8000-000000000001');
    formData.append('scope', 'role');
    const fakeFile = new File(['Some text content that is definitely long enough to qualify as a valid training document content'], 'test.txt', { type: 'text/plain' });
    formData.append('files', fakeFile, 'test.txt');

    const req = new NextRequest('http://localhost/api/training/documents', {
      method: 'POST',
    });
    req.formData = async () => formData;

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].error).toBe('Could not process training document');

    // Rollback verifications
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
  });
});
