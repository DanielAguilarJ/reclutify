import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/training/documents/process/route';
import {
  buildTrainingDocumentStoragePath,
  MAX_TRAINING_FILE_SIZE,
} from '@/lib/training/documents';
import { TrainingAuthError } from '@/lib/training/auth';

vi.mock('server-only', () => ({}));

/**
 * Pruebas del paso 3 de la subida en tres pasos
 * (`POST /api/training/documents/process`).
 *
 * Lo que se está protegiendo aquí es el **modelo de confianza** de la subida
 * directa. Con el archivo viajando del navegador al bucket, el servidor deja de
 * ver los bytes en el momento de la subida: cuando llega esta petición, en el
 * bucket puede haber cualquier cosa y el cuerpo puede declarar cualquier
 * `storagePath`. Las dos comprobaciones que cierran ese hueco son las que se
 * verifican:
 *
 * 1. Los bytes se validan tras descargarlos y, si el objeto se rechaza, **se
 *    borra del bucket** (nadie más va a limpiarlo: la fila nunca existió y el
 *    navegador ya terminó su parte).
 * 2. La ruta declarada tiene que ser exactamente la que el servidor habría
 *    emitido; si no, se responde 400 **sin descargar nada**. Es la defensa
 *    contra el cruce entre organizaciones, porque el cliente admin elude RLS.
 */

// El texto del PDF es mutable por prueba: distinguir `ready` de `needs_ocr`
// depende exclusivamente de cuánto texto devuelve el parser.
const pdfParseState = vi.hoisted(() => ({
  text: 'Extracted PDF text that is long enough to pass the fifty character rule',
}));

vi.mock('pdf-parse', () => ({
  default: async () => ({ text: pdfParseState.text }),
}));

vi.mock('mammoth', () => ({
  extractRawText: async () => ({
    value: 'Extracted Word text that is long enough to pass validation',
  }),
}));

const PROGRAM_ID = '00000000-0000-4000-8000-000000000001';
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000aa';
const ORG_ID = 'org-222';
const ROLE_ID = 'role-333';

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

// ── Storage ──
const mockStorageDownload = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageFrom = vi.fn(() => ({
  download: mockStorageDownload,
  remove: mockStorageRemove,
}));

// ── Tablas ──
const mockDuplicateLookup = vi.fn();
const mockInsertDoc = vi.fn();
const mockDeleteDoc = vi.fn();
const mockInsertChunks = vi.fn();
const mockSelectAssoc = vi.fn();
const mockSelectMaxAssoc = vi.fn();
const mockInsertAssoc = vi.fn();

/** Cadena encadenable mínima que resuelve en `{ data, error }`. */
const createFluentMock = (resolvedValue: unknown = null) => {
  const fluent: Record<string, unknown> = {};
  const self = () => fluent;

  Object.assign(fluent, {
    select: self,
    eq: self,
    is: self,
    order: self,
    limit: self,
    insert: self,
    delete: self,
    maybeSingle: async () => ({ data: resolvedValue, error: null }),
    single: async () => ({ data: resolvedValue, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: resolvedValue, error: null }).then(resolve),
  });

  return fluent;
};

const mockFrom = vi.fn((table: string) => {
  if (table === 'training_documents') {
    const fluent = createFluentMock();

    // Consulta de deduplicación: select(...).eq(...)...maybeSingle().
    fluent.select = () => fluent;
    fluent.maybeSingle = () => mockDuplicateLookup();
    fluent.single = () => mockDuplicateLookup();

    // El insert devuelve la fila insertada, de modo que el `status` que se
    // afirma en las pruebas lo decide la implementación, no el fixture.
    fluent.insert = (payload: unknown) => ({
      select: () => ({
        maybeSingle: () => mockInsertDoc(payload),
        single: () => mockInsertDoc(payload),
      }),
    });

    fluent.delete = () => ({ eq: mockDeleteDoc });

    return fluent;
  }

  if (table === 'training_document_chunks') {
    const fluent = createFluentMock();
    fluent.insert = mockInsertChunks;
    return fluent;
  }

  if (table === 'training_program_documents') {
    const fluent = createFluentMock();
    fluent.select = () => ({
      eq: () => ({
        eq: () => ({ maybeSingle: mockSelectAssoc }),
        order: () => ({ limit: () => ({ maybeSingle: mockSelectMaxAssoc }) }),
      }),
    });
    fluent.insert = mockInsertAssoc;
    return fluent;
  }

  return createFluentMock();
});

// `TrainingAuthError` se exporta desde el mock porque `trainingApiErrorResponse`
// la reconoce con `instanceof`: sin ella, un 403 caería en el 500 genérico.
vi.mock('@/lib/training/auth', () => ({
  TrainingAuthError: class extends Error {
    constructor(
      message: string,
      public status: number,
    ) {
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
        storage: { from: mockStorageFrom },
      },
      user: { id: 'usr-1' },
    };
  },
}));

// ============================================================
// Utilidades
// ============================================================

/**
 * Ruta esperada derivada con la misma función que usa la ruta bajo prueba, para
 * que la prueba no se rompa si la derivación cambia de forma legítima.
 */
const storagePathFor = (
  fileName: string,
  scope: 'role' | 'organization' = 'role',
  documentId = DOCUMENT_ID,
) =>
  buildTrainingDocumentStoragePath({
    orgId: ORG_ID,
    scope,
    roleId: scope === 'role' ? ROLE_ID : null,
    documentId,
    fileName,
  });

/** Respuesta de `download()` con los bytes que la prueba quiera probar. */
const respondWithBytes = (parts: Array<string | Uint8Array>) => {
  mockStorageDownload.mockResolvedValue({
    data: new Blob(parts as BlobPart[]),
    error: null,
  });
};

const buildRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/training/documents/process', {
    method: 'POST',
    body: JSON.stringify(body),
  });

const processBody = (overrides: Record<string, unknown> = {}) => {
  const fileName = (overrides.fileName as string) ?? 'manual.txt';

  return {
    programId: PROGRAM_ID,
    scope: 'role',
    documentId: DOCUMENT_ID,
    storagePath: storagePathFor(fileName),
    fileName,
    ...overrides,
  };
};

const existingDocumentRow = (id: string) => ({
  id,
  org_id: ORG_ID,
  role_id: ROLE_ID,
  scope: 'role',
  file_name: 'manual.txt',
  file_type: 'text/plain',
  file_size: 4096,
  storage_path: `${ORG_ID}/${ROLE_ID}/${id}/manual.txt`,
  ai_summary: 'Resumen previo',
  ai_topics: [],
  status: 'ready',
  processing_error: null,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
});

const LONG_TEXT =
  'Contenido de capacitación suficientemente largo para superar el mínimo de cincuenta caracteres.';

beforeEach(() => {
  vi.clearAllMocks();

  mockProgram = {
    id: PROGRAM_ID,
    org_id: ORG_ID,
    status: 'draft',
    role_id: ROLE_ID,
  };
  mockAuthError = null;
  process.env.OPENROUTER_API_KEY = ''; // Sin llamada a IA: aísla el flujo local.
  pdfParseState.text =
    'Extracted PDF text that is long enough to pass the fifty character rule';

  respondWithBytes([LONG_TEXT]);
  mockStorageRemove.mockResolvedValue({ error: null });

  // Camino feliz por defecto: sin duplicado, insert que devuelve lo insertado.
  mockDuplicateLookup.mockResolvedValue({ data: null, error: null });
  mockInsertDoc.mockImplementation(async (payload: unknown) => ({
    data: payload,
    error: null,
  }));
  mockDeleteDoc.mockResolvedValue({ error: null });
  mockInsertChunks.mockResolvedValue({ error: null });
  mockSelectAssoc.mockResolvedValue({ data: null, error: null });
  mockSelectMaxAssoc.mockResolvedValue({ data: null, error: null });
  mockInsertAssoc.mockResolvedValue({ error: null });
});

// ============================================================
// Modelo de confianza: bytes reales y pertenencia de la ruta
// ============================================================

describe('Process endpoint trust boundary (/api/training/documents/process)', () => {
  it('rejects bytes that do not match the declared extension and deletes the object', async () => {
    // Un `.pdf` cuyo contenido es texto plano: exactamente lo que un cliente
    // puede dejar en el bucket con una URL firmada legítima.
    const fileName = 'fake.pdf';
    respondWithBytes(['This is plain text pretending to be a PDF document']);

    const res = await POST(buildRequest(processBody({ fileName })));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.failure.code).toBe('FILE_TYPE_MISMATCH');
    expect(body.failure.fileName).toBe(fileName);

    // Lo que de verdad importa: el objeto rechazado no se queda en el bucket.
    expect(mockStorageRemove).toHaveBeenCalledWith([storagePathFor(fileName)]);

    // Y nada llegó a persistirse.
    expect(mockInsertDoc).not.toHaveBeenCalled();
    expect(mockInsertAssoc).not.toHaveBeenCalled();
  });

  it('rejects an object whose real size exceeds the limit and deletes it', async () => {
    // El tamaño que se valida es el de los bytes descargados, no el que declaró
    // el navegador en el paso 1.
    const fileName = 'huge.txt';
    respondWithBytes([new Uint8Array(MAX_TRAINING_FILE_SIZE + 1)]);

    const res = await POST(buildRequest(processBody({ fileName })));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.failure.code).toBe('FILE_TOO_LARGE');

    expect(mockStorageRemove).toHaveBeenCalledWith([storagePathFor(fileName)]);
    expect(mockInsertDoc).not.toHaveBeenCalled();
  });

  it('rejects a storagePath that does not belong to the program without downloading', async () => {
    // Defensa contra el cruce entre organizaciones: un administrador legítimo de
    // esta organización declara una ruta de otra. El servidor usa el cliente
    // admin y por tanto elude RLS, así que si descargara ese objeto el texto de
    // otra organización acabaría en un documento de esta.
    const foreignPath = 'org-999/role-999/00000000-0000-4000-8000-0000000000bb/secreto.pdf';

    const res = await POST(
      buildRequest(processBody({ fileName: 'secreto.pdf', storagePath: foreignPath })),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe('string');

    // La comprobación ocurre antes de tocar storage.
    expect(mockStorageDownload).not.toHaveBeenCalled();
    expect(mockInsertDoc).not.toHaveBeenCalled();
    // Tampoco se borra el objeto ajeno: no es nuestro para destruirlo.
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('reports STORAGE_DOWNLOAD_FAILED when the object cannot be downloaded', async () => {
    mockStorageDownload.mockResolvedValue({
      data: null,
      error: { message: 'Object not found', statusCode: '404' },
    });

    const res = await POST(buildRequest(processBody()));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.failure.code).toBe('STORAGE_DOWNLOAD_FAILED');
    // La causa técnica se queda en el log del servidor.
    expect(JSON.stringify(body)).not.toContain('Object not found');

    // Un fallo de descarga puede ser transitorio: borrar destruiría una subida
    // legítima que el administrador podría reprocesar.
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('responds 403 to a user without owner or admin role', async () => {
    mockAuthError = new TrainingAuthError('Forbidden', 403);

    const res = await POST(buildRequest(processBody()));

    expect(res.status).toBe(403);
    expect(mockStorageDownload).not.toHaveBeenCalled();
  });
});

// ============================================================
// Deduplicación
// ============================================================

describe('Process endpoint deduplication (/api/training/documents/process)', () => {
  it('reuses the existing document on a duplicate checksum and deletes the redundant object', async () => {
    const EXISTING_ID = '00000000-0000-4000-8000-0000000000cc';
    mockDuplicateLookup.mockResolvedValue({
      data: existingDocumentRow(EXISTING_ID),
      error: null,
    });

    const res = await POST(buildRequest(processBody()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.document.id).toBe(EXISTING_ID);

    // No se duplica la fila…
    expect(mockInsertDoc).not.toHaveBeenCalled();
    expect(mockInsertChunks).not.toHaveBeenCalled();

    // …y el objeto recién subido, que es redundante, se retira del bucket.
    expect(mockStorageRemove).toHaveBeenCalledWith([storagePathFor('manual.txt')]);

    // El documento reutilizado sí se asocia al programa.
    expect(mockInsertAssoc).toHaveBeenCalledWith(
      expect.objectContaining({
        program_id: PROGRAM_ID,
        document_id: EXISTING_ID,
      }),
    );
  });
});

// ============================================================
// Estados derivados del texto extraído
// ============================================================

describe('Process endpoint document status (/api/training/documents/process)', () => {
  it('leaves a PDF without enough text in needs_ocr and counts it as processed', async () => {
    // Un PDF escaneado no es un fallo: se guarda, se asocia y la interfaz lo
    // muestra como advertencia.
    pdfParseState.text = 'Portada';
    const fileName = 'escaneado.pdf';
    respondWithBytes(['%PDF-1.7\n%binary-ish content\n']);

    const res = await POST(buildRequest(processBody({ fileName })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.document.status).toBe('needs_ocr');
    expect(body.document.processingError).toContain('OCR');

    // Se persiste y se asocia como cualquier otro documento procesado.
    expect(mockInsertDoc).toHaveBeenCalled();
    expect(mockInsertAssoc).toHaveBeenCalled();

    // Sin texto no hay fragmentos, y el objeto se conserva para un OCR futuro.
    expect(mockInsertChunks).not.toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });

  it('marks a PDF with enough text as ready and indexes its chunks', async () => {
    pdfParseState.text = LONG_TEXT;
    const fileName = 'manual-completo.pdf';
    respondWithBytes(['%PDF-1.7\n%binary-ish content\n']);

    const res = await POST(buildRequest(processBody({ fileName })));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.document.status).toBe('ready');
    expect(mockInsertChunks).toHaveBeenCalled();
    expect(mockStorageRemove).not.toHaveBeenCalled();
  });
});
