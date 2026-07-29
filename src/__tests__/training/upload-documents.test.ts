import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/documents/route';
import { MAX_TRAINING_FILE_SIZE } from '@/lib/training/documents';

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
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  insert: (obj: unknown) => FluentMock;
  delete: () => FluentMock;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

const createFluentMock = (resolvedValue: unknown, errorValue: unknown = null): FluentMock => {
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

const PROGRAM_ID = '00000000-0000-4000-8000-000000000001';

let mockProgram: unknown = { id: PROGRAM_ID, org_id: 'org-222', status: 'draft', role_id: 'role-333' };
const mockStorageUpload = vi.fn().mockResolvedValue({ error: null });
const mockStorageRemove = vi.fn().mockResolvedValue({ error: null });

const mockDeleteDoc = vi.fn().mockResolvedValue({ error: null });
const mockInsertDoc = vi.fn();
const mockInsertChunks = vi.fn();
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
    } as unknown as FluentMock);
    // Custom delete chain
    fluent.delete = () => ({
      eq: mockDeleteDoc,
    } as unknown as FluentMock);
    return fluent;
  }
  if (table === 'training_document_chunks') {
    const fluent = createFluentMock(null);
    fluent.insert = mockInsertChunks;
    return fluent;
  }
  if (table === 'training_program_documents') {
    const fluent = createFluentMock(null);
    fluent.select = () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: mockSelectAssoc,
        } as unknown as FluentMock),
        order: () => ({
          limit: () => ({
            maybeSingle: mockSelectMaxAssoc,
          }),
        }),
      } as unknown as FluentMock),
    } as unknown as FluentMock);
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

/** Fila de `training_documents` tal como la devuelve el insert con `select('*')`. */
const readyDocumentRow = (id: string, fileName = 'test.txt') => ({
  id,
  org_id: 'org-222',
  role_id: 'role-333',
  scope: 'role',
  file_name: fileName,
  file_type: 'text/plain',
  storage_path: `org-222/role-333/${id}/${fileName}`,
  status: 'ready',
});

/** Archivo de texto válido: extensión, MIME y bytes coherentes, texto suficiente. */
const buildValidTextFile = (name = 'test.txt') =>
  new File(
    ['Some text content that is definitely long enough to qualify as a valid training document content'],
    name,
    { type: 'text/plain' }
  );

const buildUploadRequest = (files: File[], scope: string = 'role') => {
  const formData = new FormData();
  formData.append('programId', PROGRAM_ID);
  formData.append('scope', scope);
  for (const file of files) {
    formData.append('files', file, file.name);
  }

  const req = new NextRequest('http://localhost/api/training/documents', {
    method: 'POST',
  });
  req.formData = async () => formData;

  return req;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockProgram = { id: PROGRAM_ID, org_id: 'org-222', status: 'draft', role_id: 'role-333' };
  process.env.OPENROUTER_API_KEY = ''; // Disable AI call to speed up test and isolate DB

  mockStorageUpload.mockResolvedValue({ error: null });
  mockStorageRemove.mockResolvedValue({ error: null });
  mockDeleteDoc.mockResolvedValue({ error: null });

  // Camino feliz por defecto: documento nuevo, fragmentos y asociación correctos.
  mockInsertDoc.mockResolvedValue({ data: readyDocumentRow('new-doc-id'), error: null });
  mockInsertChunks.mockResolvedValue({ error: null });
  mockSelectAssoc.mockResolvedValue({ data: null, error: null });
  mockSelectMaxAssoc.mockResolvedValue({ data: null, error: null });
  mockInsertAssoc.mockResolvedValue({ error: null });
});

describe('Upload Documents Endpoint Rollbacks (/api/training/documents)', () => {
  it('triggers rollback of document and storage when query for existing association fails', async () => {
    // Mock document insert success
    mockInsertDoc.mockResolvedValueOnce({
      data: readyDocumentRow('new-doc-id'),
      error: null,
    });

    // Mock existing association query failing
    mockSelectAssoc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database query timeout', code: '57014' },
    });

    const req = buildUploadRequest([buildValidTextFile()]);

    const res = await POST(req);
    // El único archivo del lote falló: fallo total (Requisito 2.1).
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].code).toBe('ASSOCIATION_FAILED');

    // Rollback verifications
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('triggers rollback of document and storage when query for max sort_order fails', async () => {
    // Mock document insert success
    mockInsertDoc.mockResolvedValueOnce({
      data: readyDocumentRow('new-doc-id'),
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

    const req = buildUploadRequest([buildValidTextFile()]);

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].code).toBe('ASSOCIATION_FAILED');

    // Rollback verifications
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('triggers rollback of document and storage when inserting program-document association fails', async () => {
    // Mock document insert success
    mockInsertDoc.mockResolvedValueOnce({
      data: readyDocumentRow('new-doc-id'),
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

    const req = buildUploadRequest([buildValidTextFile()]);

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].code).toBe('ASSOCIATION_FAILED');

    // Rollback verifications
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
  });
});

describe('Upload Documents Endpoint Failure Reporting (/api/training/documents)', () => {
  it('never responds success: true when every file in the batch failed (422)', async () => {
    // Requisito 12.1: esta prueba debe fallar si la ruta vuelve a responder
    // `success: true` habiendo fallado todos los archivos del lote.
    mockStorageUpload.mockResolvedValue({
      error: { message: 'Bucket training-documents not found', statusCode: '404' },
    });

    const req = buildUploadRequest([
      buildValidTextFile('first.txt'),
      buildValidTextFile('second.txt'),
    ]);

    const res = await POST(req);

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.documents).toEqual([]);
    expect(body.failures).toHaveLength(2);
    expect(body.failures.map((f: { fileName: string }) => f.fileName)).toEqual([
      'first.txt',
      'second.txt',
    ]);
  });

  it('responds 200 with success: true and non-empty failures on a partial batch', async () => {
    // Lote mixto: el .txt válido se procesa, el .pdf con bytes falsos falla.
    const mismatchedPdf = new File(
      ['This is plain text pretending to be a PDF document with enough length'],
      'fake.pdf',
      { type: 'application/pdf' }
    );

    const req = buildUploadRequest([buildValidTextFile('good.txt'), mismatchedPdf]);

    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.documents).toHaveLength(1);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].fileName).toBe('fake.pdf');
    expect(body.failures[0].code).toBe('FILE_TYPE_MISMATCH');
  });

  it('reports STORAGE_UPLOAD_FAILED when the storage upload fails', async () => {
    mockStorageUpload.mockResolvedValue({
      error: { message: 'Storage write rejected', statusCode: '500' },
    });

    const res = await POST(buildUploadRequest([buildValidTextFile()]));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.failures[0].code).toBe('STORAGE_UPLOAD_FAILED');
    expect(typeof body.failures[0].message).toBe('string');
    // El documento nunca se insertó, así que no hay fila que revertir.
    expect(mockInsertDoc).not.toHaveBeenCalled();
    // El objeto parcial se limpia del bucket.
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('reports DATABASE_INSERT_FAILED when inserting into training_documents fails', async () => {
    mockInsertDoc.mockResolvedValueOnce({
      data: null,
      error: { message: 'null value in column violates not-null constraint', code: '23502' },
    });

    const res = await POST(buildUploadRequest([buildValidTextFile()]));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].code).toBe('DATABASE_INSERT_FAILED');
    // Sin fila que respalde el objeto, el archivo se retira del bucket.
    expect(mockStorageRemove).toHaveBeenCalled();
  });

  it('reports CHUNKS_INSERT_FAILED when inserting document chunks fails', async () => {
    mockInsertChunks.mockResolvedValueOnce({
      error: { message: 'relation training_document_chunks does not exist', code: '42P01' },
    });

    const res = await POST(buildUploadRequest([buildValidTextFile()]));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].code).toBe('CHUNKS_INSERT_FAILED');
    // La fila y el objeto creados en esta iteración se revierten.
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockStorageRemove).toHaveBeenCalled();
    // La asociación no debe intentarse tras el fallo de fragmentos.
    expect(mockInsertAssoc).not.toHaveBeenCalled();
  });

  it('reports FILE_TOO_LARGE without touching storage when the file exceeds the limit', async () => {
    const oversizedFile = new File(
      [new Uint8Array(MAX_TRAINING_FILE_SIZE + 1)],
      'huge.txt',
      { type: 'text/plain' }
    );

    const res = await POST(buildUploadRequest([oversizedFile]));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].code).toBe('FILE_TOO_LARGE');
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('does not leak the technical cause of a failure in the response body', async () => {
    // Requisito 2.5: la causa técnica solo va al log del servidor.
    const internalDetail = 'internal-postgres-detail-xyz';

    mockInsertDoc.mockResolvedValueOnce({
      data: null,
      error: {
        message: `insert failed: ${internalDetail}`,
        details: `Key (org_id)=(org-222) ${internalDetail}`,
        hint: internalDetail,
        code: '23502',
      },
    });

    const res = await POST(buildUploadRequest([buildValidTextFile()]));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.failures[0].code).toBe('DATABASE_INSERT_FAILED');
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });

  it('exposes fileName, code and message on every failure, and nothing else', async () => {
    mockStorageUpload.mockResolvedValue({
      error: { message: 'Storage write rejected', statusCode: '500' },
    });

    const res = await POST(buildUploadRequest([buildValidTextFile('report.txt')]));

    const body = await res.json();
    expect(Object.keys(body.failures[0]).sort()).toEqual(['code', 'fileName', 'message']);
    expect(body.failures[0].fileName).toBe('report.txt');
  });
});
