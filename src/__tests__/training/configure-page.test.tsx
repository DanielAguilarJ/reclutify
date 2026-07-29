import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import React, { Suspense } from 'react';
import ConfigureProgramPage from '../../app/admin/training/configure/[programId]/page';
import type {
  ClientOcrProgress,
  ClientPdfTextResult,
} from '../../lib/training/client-ocr';

/**
 * Pantalla de configuración: OCR de navegador y aviso de contexto.
 *
 * Lo que se prueba aquí no es el OCR (eso lo cubre `client-ocr.test.ts`) sino el
 * **contrato entre la pantalla y ese módulo**, que es donde estaba el riesgo:
 *
 * - un PDF con capa de texto no debe mandar `ocrText`, porque el servidor extrae
 *   el suyo de los bytes reales del bucket;
 * - un PDF escaneado sí debe mandarlo, o el documento muere en `needs_ocr`;
 * - cancelar o fallar el OCR **no** puede tumbar la subida: el archivo ya está
 *   en el bucket y el documento tiene que quedar guardado igual.
 *
 * El módulo de OCR se sustituye por un doble porque el de verdad necesita
 * `pdfjs-dist`, un worker y WASM: nada de eso existe en jsdom, y el
 * comportamiento que importa es cuál de sus tres desenlaces toma la pantalla.
 */

const {
  mockUseAppStore,
  mockUseTrainingAdminStore,
  mockExtractTrainingTextFromPdf,
  FakeAbortedError,
  FakeEmptyResultError,
} = vi.hoisted(() => {
  /** Errores del módulo real: la pantalla los distingue por `name`. */
  class HoistedAbortedError extends Error {
    constructor() {
      super('Client OCR aborted');
      this.name = 'ClientOcrAbortedError';
    }
  }

  class HoistedEmptyResultError extends Error {
    constructor() {
      super('Client OCR produced no usable text');
      this.name = 'ClientOcrEmptyResultError';
    }
  }

  return {
    mockUseAppStore: vi.fn(),
    mockUseTrainingAdminStore: vi.fn(),
    mockExtractTrainingTextFromPdf: vi.fn(),
    FakeAbortedError: HoistedAbortedError,
    FakeEmptyResultError: HoistedEmptyResultError,
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/store/appStore', () => ({
  useAppStore: mockUseAppStore,
}));

vi.mock('@/store/trainingAdminStore', () => ({
  useTrainingAdminStore: mockUseTrainingAdminStore,
}));

const mockUploadToSignedUrl = vi.fn();

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    storage: {
      from: () => ({ uploadToSignedUrl: mockUploadToSignedUrl }),
    },
  }),
}));

vi.mock('@/lib/training/client-ocr', () => ({
  DEFAULT_OCR_PAGE_LIMIT: 40,
  extractTrainingTextFromPdf: mockExtractTrainingTextFromPdf,
  ClientOcrAbortedError: FakeAbortedError,
  ClientOcrEmptyResultError: FakeEmptyResultError,
}));

// ============================================================
// Respuestas del servidor
// ============================================================

interface FetchScript {
  /** Aviso que devuelve `generate-modules`; ausente = todo el material cupo. */
  contextNotice?: unknown;
}

const READY_DOCUMENT = {
  id: 'doc-ready',
  fileName: 'manual-vigente.pdf',
  scope: 'role',
  status: 'ready',
  aiSummary: 'Manual de operaciones',
};

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: async () => body,
  } as unknown as Response;
}

function installFetch(script: FetchScript = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);

    if (url.endsWith('/api/training/programs/prog-1')) {
      return jsonResponse({
        program: {
          id: 'prog-1',
          title: 'Onboarding Operaciones',
          description: '',
          welcomeMessage: '',
          aiPersonality: 'friendly_mentor',
          contentLanguage: 'es',
          passingScore: 70,
          status: 'draft',
          version: 1,
        },
        role: { id: 'role-1', title: 'Operaciones' },
        modules: [],
      });
    }

    if (url.endsWith('/api/training/programs/prog-1/documents')) {
      return jsonResponse({ attached: [READY_DOCUMENT], available: [] });
    }

    if (url.endsWith('/api/training/documents/upload-url')) {
      return jsonResponse({
        documentId: 'doc-new',
        storagePath: 'org-1/role-1/doc-new.pdf',
        token: 'signed-token',
      });
    }

    if (url.endsWith('/api/training/documents/process')) {
      return jsonResponse({ success: true, document: { id: 'doc-new', status: 'ready' } });
    }

    if (url.endsWith('/api/training/generate-modules')) {
      return jsonResponse({
        success: true,
        modules: [
          {
            id: 'mod-1',
            programId: 'prog-1',
            title: 'Módulo generado',
            description: '',
            content: { sections: [] },
            sourceDocumentIds: ['doc-ready'],
            sortOrder: 1,
            durationEstimate: 20,
            evaluationEnabled: false,
            evaluationQuestions: [],
          },
        ],
        ...(script.contextNotice ? { contextNotice: script.contextNotice } : {}),
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
}

// ============================================================
// Utilidades de render
// ============================================================

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPage() {
  // El render va dentro de un `act` esperado porque la pantalla suspende: lee
  // sus parámetros de ruta con `use(props.params)`.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <ConfigureProgramPage params={Promise.resolve({ programId: 'prog-1' })} />
      </Suspense>
    );
  });

  await flush();
}

/**
 * Mete archivos en la cola por la zona de arrastre.
 *
 * Es el único camino de selección que no exige falsear `input.files`, que en
 * jsdom es de solo lectura.
 */
function dropFiles(files: File[]) {
  const zone = screen.getByText(/Arrastra archivos aquí/).closest('div');

  if (!zone) throw new Error('Drop zone not found');

  fireEvent.drop(zone, { dataTransfer: { files } });
}

async function clickUpload() {
  const button = screen.getByRole('button', { name: /Cargar Documentos seleccionados/ });

  await act(async () => {
    fireEvent.click(button);
  });

  await flush();
}

function processBody(fetchMock: ReturnType<typeof installFetch>): Record<string, unknown> {
  // El doble declara un solo parámetro, así que sus tuplas de llamada no
  // incluyen el `init`. Se reexpresa el tipo aquí, donde sí se necesita leerlo.
  const calls = fetchMock.mock.calls as unknown as Array<
    [RequestInfo | URL, RequestInit | undefined]
  >;

  const call = calls.find(([input]) =>
    String(input).endsWith('/api/training/documents/process')
  );

  if (!call) throw new Error('process was never called');

  return JSON.parse(String(call[1]?.body ?? '{}')) as Record<string, unknown>;
}

const pdfFile = (name = 'escaneado.pdf') =>
  new File(['%PDF-1.7'], name, { type: 'application/pdf' });

const textFile = (name = 'notas.txt') =>
  new File(['contenido'], name, { type: 'text/plain' });

const ocrResult = (overrides: Partial<Extract<ClientPdfTextResult, { source: 'ocr' }>> = {}) =>
  ({
    source: 'ocr',
    text: 'TEXTO RECONOCIDO POR OCR',
    language: 'spa',
    pagesProcessed: 3,
    totalPages: 3,
    partial: false,
    ...overrides,
  }) satisfies ClientPdfTextResult;

describe('ConfigureProgramPage · OCR de navegador', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppStore.mockReturnValue({ language: 'es' });
    mockUseTrainingAdminStore.mockReturnValue({
      updateProgram: vi.fn(),
      addModule: vi.fn(),
      updateModule: vi.fn(),
      removeModule: vi.fn(),
      detachDocumentFromProgram: vi.fn(),
      setError: vi.fn(),
    });
    mockUploadToSignedUrl.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no envía ocrText cuando el PDF ya trae capa de texto', async () => {
    const fetchMock = installFetch();
    mockExtractTrainingTextFromPdf.mockResolvedValue({
      source: 'text-layer',
      pagesScanned: 1,
      totalPages: 12,
    } satisfies ClientPdfTextResult);

    await renderPage();
    dropFiles([pdfFile('con-texto.pdf')]);
    await clickUpload();

    expect(mockExtractTrainingTextFromPdf).toHaveBeenCalledTimes(1);
    expect(processBody(fetchMock)).not.toHaveProperty('ocrText');
    expect(screen.getByText('Procesado')).toBeInTheDocument();
  });

  it('envía el texto reconocido cuando el PDF está escaneado', async () => {
    const fetchMock = installFetch();
    mockExtractTrainingTextFromPdf.mockResolvedValue(ocrResult());

    await renderPage();
    dropFiles([pdfFile()]);
    await clickUpload();

    // El idioma del OCR sale del programa, no de la preferencia del administrador.
    expect(mockExtractTrainingTextFromPdf).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ contentLanguage: 'es' })
    );
    expect(processBody(fetchMock).ocrText).toBe('TEXTO RECONOCIDO POR OCR');
    expect(screen.getByText(/Texto reconocido con OCR \(3 de 3 páginas\)/)).toBeInTheDocument();
  });

  it('avisa de que el resultado es parcial cuando no cubre el documento entero', async () => {
    installFetch();
    mockExtractTrainingTextFromPdf.mockResolvedValue(
      ocrResult({ pagesProcessed: 40, totalPages: 96, partial: true })
    );

    await renderPage();
    dropFiles([pdfFile('largo.pdf')]);
    await clickUpload();

    expect(
      screen.getByText(/OCR parcial: se procesaron 40 de 96 páginas/)
    ).toBeInTheDocument();
  });

  it('cancela el OCR de un documento y lo procesa sin ocrText', async () => {
    const fetchMock = installFetch();

    let emitProgress: ((progress: ClientOcrProgress) => void) | undefined;

    mockExtractTrainingTextFromPdf.mockImplementation(
      (_file: File, options: { signal?: AbortSignal; onProgress?: (p: ClientOcrProgress) => void }) =>
        new Promise<ClientPdfTextResult>((_resolve, reject) => {
          emitProgress = options.onProgress;
          options.onProgress?.({
            phase: 'loading-engine',
            page: 0,
            totalPages: 3,
            pageProgress: 0,
          });
          options.signal?.addEventListener('abort', () => reject(new FakeAbortedError()));
        })
    );

    await renderPage();
    dropFiles([pdfFile('escaneado.pdf')]);

    const uploadButton = screen.getByRole('button', {
      name: /Cargar Documentos seleccionados/,
    });

    await act(async () => {
      fireEvent.click(uploadButton);
    });
    await flush();

    // La fase larga se nombra: sin esto el administrador cree que se colgó. El
    // texto aparece dos veces a propósito: en la fila (a la vista) y en la
    // región en vivo (para el lector de pantalla).
    expect(screen.getAllByText(/Descargando el motor de OCR/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent(/Descargando el motor de OCR/);

    await act(async () => {
      emitProgress?.({ phase: 'recognizing', page: 2, totalPages: 3, pageProgress: 0.5 });
    });

    expect(screen.getAllByText(/Reconociendo texto: página 2 de 3/).length).toBeGreaterThan(0);
    expect(screen.getByRole('status')).toHaveTextContent(/escaneado\.pdf/);

    const cancelButton = screen.getByRole('button', {
      name: 'Cancelar el reconocimiento de texto de escaneado.pdf',
    });

    await act(async () => {
      fireEvent.click(cancelButton);
    });
    await flush();

    expect(processBody(fetchMock)).not.toHaveProperty('ocrText');
    expect(screen.getByText(/OCR cancelado/)).toBeInTheDocument();
    expect(screen.getByText('Procesado')).toBeInTheDocument();
  });

  it('sigue con la subida cuando el OCR falla', async () => {
    const fetchMock = installFetch();
    mockExtractTrainingTextFromPdf.mockRejectedValue(new Error('worker crashed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await renderPage();
    dropFiles([pdfFile('roto.pdf')]);
    await clickUpload();

    expect(processBody(fetchMock)).not.toHaveProperty('ocrText');
    expect(screen.getByText(/No se pudo ejecutar el OCR/)).toBeInTheDocument();
    expect(screen.getByText('Procesado')).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it('deja el documento pendiente de OCR cuando el escaneo no da texto legible', async () => {
    const fetchMock = installFetch();
    mockExtractTrainingTextFromPdf.mockRejectedValue(new FakeEmptyResultError());

    await renderPage();
    dropFiles([pdfFile('ilegible.pdf')]);
    await clickUpload();

    expect(processBody(fetchMock)).not.toHaveProperty('ocrText');
    expect(screen.getByText(/no produjo texto legible/)).toBeInTheDocument();
    expect(screen.getByText('Procesado')).toBeInTheDocument();
  });

  it('no intenta OCR con archivos que no son PDF', async () => {
    const fetchMock = installFetch();

    await renderPage();
    dropFiles([textFile()]);
    await clickUpload();

    expect(mockExtractTrainingTextFromPdf).not.toHaveBeenCalled();
    expect(processBody(fetchMock)).not.toHaveProperty('ocrText');
    expect(screen.getByText('Procesado')).toBeInTheDocument();
  });
});

describe('ConfigureProgramPage · aviso de contexto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppStore.mockReturnValue({ language: 'es' });
    mockUseTrainingAdminStore.mockReturnValue({
      updateProgram: vi.fn(),
      addModule: vi.fn(),
      updateModule: vi.fn(),
      removeModule: vi.fn(),
      detachDocumentFromProgram: vi.fn(),
      setError: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function generateModules() {
    const button = screen.getByRole('button', { name: /Generar Módulos con AI/ });

    await act(async () => {
      fireEvent.click(button);
    });
    await flush();
  }

  it('muestra qué se recortó y qué quedó fuera del tope cuando el servidor lo avisa', async () => {
    installFetch({
      contextNotice: {
        budgetChars: 120000,
        documentLimit: 20,
        documentsOmittedByLimit: 2,
        omittedChars: 41000,
        truncatedDocuments: [
          { fileName: 'politicas.pdf', includedChars: 30000, omittedChars: 41000 },
        ],
      },
    });

    await renderPage();
    await generateModules();

    expect(screen.getByText('La IA no vio todo el material')).toBeInTheDocument();
    expect(screen.getByText('politicas.pdf')).toBeInTheDocument();
    expect(screen.getByText(/se usaron .* de .* caracteres/)).toBeInTheDocument();
    expect(
      screen.getByText(/2 documento\(s\) asociados no entraron en la generación/)
    ).toBeInTheDocument();
  });

  it('no muestra ningún aviso cuando todo el material entró', async () => {
    installFetch();

    await renderPage();
    await generateModules();

    expect(screen.queryByText('La IA no vio todo el material')).not.toBeInTheDocument();
    expect(screen.getByText('Módulos generados con éxito')).toBeInTheDocument();
  });
});
