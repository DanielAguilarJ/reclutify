import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/documents/upload-url/route';
import { MAX_TRAINING_FILE_SIZE } from '@/lib/training/documents';
import { TrainingAuthError } from '@/lib/training/auth';

vi.mock('server-only', () => ({}));

const PROGRAM_ID = '00000000-0000-4000-8000-000000000001';
const ORG_ID = 'org-222';
const ROLE_ID = 'role-333';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MockProgram {
  id: string;
  org_id: string;
  status: string;
  role_id: string | null;
}

let mockProgram: MockProgram = {
  id: PROGRAM_ID,
  org_id: ORG_ID,
  status: 'draft',
  role_id: ROLE_ID,
};

let mockAuthError: Error | null = null;

const mockCreateSignedUploadUrl = vi.fn();
const mockStorageFrom = vi.fn(() => ({
  createSignedUploadUrl: mockCreateSignedUploadUrl,
}));

// `TrainingAuthError` se exporta desde el mock porque `trainingApiErrorResponse`
// la comprueba con `instanceof`: si el mock no la expusiera, el 403 caería en el
// 500 genérico y la prueba dejaría de medir lo que pretende.
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
        storage: {
          from: mockStorageFrom,
        },
      },
      user: { id: 'usr-1' },
    };
  },
}));

const buildRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/training/documents/upload-url', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const validBody = (overrides: Record<string, unknown> = {}) => ({
  programId: PROGRAM_ID,
  scope: 'role',
  fileName: 'manual.pdf',
  fileSize: 1024,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockProgram = {
    id: PROGRAM_ID,
    org_id: ORG_ID,
    status: 'draft',
    role_id: ROLE_ID,
  };
  mockAuthError = null;
  mockCreateSignedUploadUrl.mockResolvedValue({
    data: {
      signedUrl: 'https://storage.example/signed/upload',
      token: 'signed-token-abc',
      path: 'ignored-by-route',
    },
    error: null,
  });
});

describe('Signed upload URL endpoint (/api/training/documents/upload-url)', () => {
  it('returns a signed URL for a draft program', async () => {
    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.signedUrl).toBe('https://storage.example/signed/upload');
    expect(body.token).toBe('signed-token-abc');

    // El `documentId` lo genera el servidor, así que solo se puede afirmar su
    // forma, no su valor.
    expect(body.documentId).toMatch(UUID_PATTERN);
    expect(body.storagePath).toBe(
      `${ORG_ID}/${ROLE_ID}/${body.documentId}/manual.pdf`,
    );

    // La URL se firma exactamente para la ruta que se devuelve.
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(body.storagePath);
  });

  it('sanitizes the file name used in the storage path', async () => {
    const res = await POST(
      buildRequest(validBody({ fileName: 'mi archivo (final).pdf' })),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    const segments: string[] = body.storagePath.split('/');
    expect(segments).toHaveLength(4);

    const [orgSegment, scopeSegment, idSegment, nameSegment] = segments;
    expect(orgSegment).toBe(ORG_ID);
    expect(scopeSegment).toBe(ROLE_ID);
    expect(idSegment).toBe(body.documentId);
    expect(idSegment).toMatch(UUID_PATTERN);

    expect(nameSegment).not.toMatch(/[\s()]/);
    expect(nameSegment.endsWith('.pdf')).toBe(true);
  });

  it('uses the literal "organization" segment for organization scope without role_id', async () => {
    mockProgram = {
      id: PROGRAM_ID,
      org_id: ORG_ID,
      status: 'draft',
      role_id: null,
    };

    const res = await POST(buildRequest(validBody({ scope: 'organization' })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.storagePath).toBe(
      `${ORG_ID}/organization/${body.documentId}/manual.pdf`,
    );
  });

  it('rejects programs that are not in draft with 409', async () => {
    mockProgram = { ...mockProgram, status: 'published' };

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('draft');
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects scope "role" when the program has no role_id with 400', async () => {
    mockProgram = { ...mockProgram, role_id: null };

    const res = await POST(buildRequest(validBody({ scope: 'role' })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects an oversized file with 413 without generating an upload URL', async () => {
    const res = await POST(
      buildRequest(validBody({ fileSize: MAX_TRAINING_FILE_SIZE + 1 })),
    );

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe('FILE_TOO_LARGE');
    expect(body.maxFileSize).toBe(MAX_TRAINING_FILE_SIZE);
    // Lo que importa: no se emite una URL de escritura por un archivo que se va
    // a rechazar de todos modos.
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects a disallowed extension with 400 without generating an upload URL', async () => {
    const res = await POST(buildRequest(validBody({ fileName: 'payload.exe' })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('FILE_TYPE_MISMATCH');
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('rejects invalid metadata with 400', async () => {
    const res = await POST(
      buildRequest({ programId: 'not-a-uuid', scope: 'role' }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid upload metadata');
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('responds 403 to a user without owner or admin role', async () => {
    mockAuthError = new TrainingAuthError('Forbidden', 403);

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(mockCreateSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('responds 500 when the signed URL cannot be created', async () => {
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: 'Bucket training-documents not found' },
    });

    const res = await POST(buildRequest(validBody()));

    expect(res.status).toBe(500);
    const body = await res.json();
    // La causa técnica se queda en el log del servidor.
    expect(JSON.stringify(body)).not.toContain('training-documents');
  });
});
