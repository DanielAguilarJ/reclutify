import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DEFAULT_OCR_PAGE_LIMIT,
  MAX_OCR_PAGE_LIMIT,
  ClientOcrAbortedError,
  ClientOcrEmptyResultError,
  extractTrainingTextFromPdf,
  resolveOcrLanguage,
  resolveOcrPageLimit,
  resolveRenderScale,
  type ClientOcrProgress,
} from '@/lib/training/client-ocr';
import {
  MAX_TRAINING_OCR_TEXT_CHARS,
  MIN_TRAINING_TEXT_CHARS,
} from '@/lib/training/document-text';

/**
 * Pruebas del OCR de navegador (`@/lib/training/client-ocr`).
 *
 * QUÉ SE PUEDE PROBAR SIN NAVEGADOR Y QUÉ NO
 * ------------------------------------------
 * Lo que decide si este módulo sirve o estorba no es la calidad del
 * reconocimiento —eso es cosa de Tesseract y solo se comprueba en un navegador
 * real con un PDF real—, sino las **decisiones** que lo rodean:
 *
 * - ejecutar OCR o no, con el mismo umbral que aplica el servidor (si los dos
 *   lados usaran números distintos, el navegador podría decidir «hay capa de
 *   texto» sobre un PDF que el servidor marca `needs_ocr`, y el documento
 *   quedaría atascado igual que antes de existir el OCR),
 * - el idioma que recibe el motor,
 * - el tope de páginas y la marca de parcialidad,
 * - el progreso que llega a la interfaz, y
 * - la liberación del worker en **todos** los caminos, incluido el de error.
 *
 * Todo eso es lógica de este archivo, así que las dos librerías se sustituyen
 * por dobles que respetan exactamente la superficie que el módulo declara
 * (`getDocument`, `getPage`, `getTextContent`, `getViewport`, `render`,
 * `createWorker`, `recognize`, `terminate`). Cargar las reales aquí no probaría
 * nada más: jsdom no rasteriza canvas ni ejecuta el WASM del motor.
 */

// ============================================================
// Dobles de las dos librerías
// ============================================================

interface RenderParams {
  canvas: HTMLCanvasElement;
  viewport: { width: number; height: number };
}

const pdfState = vi.hoisted(() => ({
  /** Texto de la capa de texto, una entrada por página. Su longitud fija `numPages`. */
  pageTexts: [] as string[],
  /** Tamaño de página en puntos PDF (carta), el que devuelve el viewport a escala 1. */
  basePageSize: { width: 612, height: 792 },
  destroyCalls: 0,
  cleanupCalls: 0,
  /** Dimensiones del canvas con las que se pidió cada render. */
  renderedCanvases: [] as Array<{ width: number; height: number }>,
}));

const tesseractState = vi.hoisted(() => ({
  createWorkerCalls: [] as Array<{
    langs: string;
    workerPath?: string;
    langPath?: string;
  }>,
  recognizeCalls: 0,
  terminateCalls: 0,
  /** Texto que "reconoce" el motor en cada página. */
  pageText: '',
  /** Si está puesto, `recognize` lanza: simula un fallo a mitad del documento. */
  recognizeError: null as Error | null,
}));

vi.mock('pdfjs-dist/webpack.mjs', () => {
  const buildPage = (pageNumber: number) => ({
    getTextContent: async () => ({
      // La forma real mezcla items de texto con items de marca (sin `str`); se
      // incluye uno de esos para que el lector tenga que ignorarlo.
      items: [
        { str: pdfState.pageTexts[pageNumber - 1] ?? '' },
        { type: 'beginMarkedContent' },
      ],
    }),
    getViewport: ({ scale }: { scale: number }) => ({
      width: pdfState.basePageSize.width * scale,
      height: pdfState.basePageSize.height * scale,
    }),
    render: ({ canvas }: RenderParams) => {
      pdfState.renderedCanvases.push({
        width: canvas.width,
        height: canvas.height,
      });

      return { promise: Promise.resolve() };
    },
    cleanup: () => {
      pdfState.cleanupCalls += 1;
    },
  });

  return {
    getDocument: () => ({
      promise: Promise.resolve({
        get numPages() {
          return pdfState.pageTexts.length;
        },
        getPage: async (pageNumber: number) => buildPage(pageNumber),
        destroy: async () => {
          pdfState.destroyCalls += 1;
        },
      }),
    }),
  };
});

vi.mock('tesseract.js', () => ({
  createWorker: async (
    langs: string,
    _oem: number | undefined,
    options?: {
      workerPath?: string;
      langPath?: string;
      logger?: (message: { status?: string; progress?: number }) => void;
    },
  ) => {
    tesseractState.createWorkerCalls.push({
      langs,
      workerPath: options?.workerPath,
      langPath: options?.langPath,
    });

    return {
      recognize: async () => {
        tesseractState.recognizeCalls += 1;

        // El motor real informa del avance de la página mientras reconoce; el
        // doble emite un único evento a mitad de página para comprobar que el
        // módulo lo traduce a su propio `onProgress`.
        options?.logger?.({ status: 'recognizing text', progress: 0.5 });
        // Y también estados que no son de reconocimiento, que deben ignorarse.
        options?.logger?.({ status: 'loading language traineddata', progress: 1 });

        if (tesseractState.recognizeError) {
          throw tesseractState.recognizeError;
        }

        return { data: { text: tesseractState.pageText } };
      },
      terminate: async () => {
        tesseractState.terminateCalls += 1;
      },
    };
  },
}));

// ============================================================
// Utilidades
// ============================================================

/** Bytes irrelevantes: el doble de pdf.js no los parsea. */
const pdfFile = () =>
  new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'escaneado.pdf', {
    type: 'application/pdf',
  });

const chars = (count: number) => 'a'.repeat(count);

/** Páginas sin capa de texto: el caso del PDF escaneado. */
const scannedPages = (count: number) => Array.from({ length: count }, () => '');

const OCR_PAGE_TEXT =
  'Texto reconocido por el motor de OCR con longitud suficiente para el umbral.';

beforeEach(() => {
  pdfState.pageTexts = scannedPages(1);
  pdfState.basePageSize = { width: 612, height: 792 };
  pdfState.destroyCalls = 0;
  pdfState.cleanupCalls = 0;
  pdfState.renderedCanvases = [];

  tesseractState.createWorkerCalls = [];
  tesseractState.recognizeCalls = 0;
  tesseractState.terminateCalls = 0;
  tesseractState.pageText = OCR_PAGE_TEXT;
  tesseractState.recognizeError = null;
});

// ============================================================
// 1. La decisión de hacer OCR usa el umbral del servidor
// ============================================================

describe('client OCR decision (umbral compartido con el servidor)', () => {
  it('no ejecuta OCR cuando la capa de texto alcanza el umbral', async () => {
    pdfState.pageTexts = [chars(MIN_TRAINING_TEXT_CHARS)];

    const result = await extractTrainingTextFromPdf(pdfFile());

    expect(result.source).toBe('text-layer');
    // El motor de OCR no se inicializa: ni worker, ni descarga de datos de
    // idioma, ni minutos de reconocimiento para nada.
    expect(tesseractState.createWorkerCalls).toHaveLength(0);
    expect(tesseractState.recognizeCalls).toBe(0);
  });

  it('ejecuta OCR con un carácter menos del umbral', async () => {
    // El límite exacto importa: es el mismo número que decide `needs_ocr` en el
    // servidor. Un PDF que el servidor va a rechazar tiene que pasar por OCR.
    pdfState.pageTexts = [chars(MIN_TRAINING_TEXT_CHARS - 1)];

    const result = await extractTrainingTextFromPdf(pdfFile());

    expect(result.source).toBe('ocr');
    expect(tesseractState.createWorkerCalls).toHaveLength(1);
  });

  it('no devuelve el texto de la capa de texto, solo el conteo de páginas', async () => {
    // Ese texto no debe viajar al servidor: para un PDF legible el servidor
    // extrae el suyo, que sí corresponde a los bytes del bucket. La forma del
    // resultado hace imposible enviarlo por error.
    pdfState.pageTexts = [chars(200), chars(200)];

    const result = await extractTrainingTextFromPdf(pdfFile());

    expect(result).toEqual({
      source: 'text-layer',
      pagesScanned: 1,
      totalPages: 2,
    });
    expect(Object.keys(result)).not.toContain('text');
  });

  it('suma el texto de todas las páginas antes de decidir que hace falta OCR', async () => {
    // Una portada con poco texto no convierte el documento en escaneado: el
    // servidor mira el texto total, así que el navegador también.
    const perPage = Math.ceil(MIN_TRAINING_TEXT_CHARS / 3);
    pdfState.pageTexts = [chars(perPage), chars(perPage), chars(perPage)];

    const result = await extractTrainingTextFromPdf(pdfFile());

    expect(result).toMatchObject({ source: 'text-layer', pagesScanned: 3 });
    expect(tesseractState.createWorkerCalls).toHaveLength(0);
  });

  it('devuelve el texto reconocido cuando el PDF no tiene capa de texto', async () => {
    pdfState.pageTexts = scannedPages(2);

    const result = await extractTrainingTextFromPdf(pdfFile());

    expect(result).toMatchObject({
      source: 'ocr',
      pagesProcessed: 2,
      totalPages: 2,
      partial: false,
    });
    if (result.source === 'ocr') {
      expect(result.text).toContain(OCR_PAGE_TEXT);
    }
    expect(tesseractState.recognizeCalls).toBe(2);
    // El worker se libera también en el camino feliz.
    expect(tesseractState.terminateCalls).toBe(1);
    expect(pdfState.destroyCalls).toBe(1);
  });

  it('lanza ClientOcrEmptyResultError cuando el OCR no llega al umbral', async () => {
    tesseractState.pageText = 'ilegible';

    const error = await extractTrainingTextFromPdf(pdfFile()).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(ClientOcrEmptyResultError);
    // Y el worker no se queda colgado por haber terminado sin texto.
    expect(tesseractState.terminateCalls).toBe(1);
  });
});

// ============================================================
// 2. Idioma
// ============================================================

describe('client OCR language selection', () => {
  it('deriva el idioma del motor del idioma de contenido del programa', async () => {
    pdfState.pageTexts = scannedPages(1);

    await extractTrainingTextFromPdf(pdfFile(), { contentLanguage: 'en' });

    expect(tesseractState.createWorkerCalls[0].langs).toBe('eng');
  });

  it('usa español cuando no se pasa idioma de contenido', async () => {
    // Defecto del producto, el mismo que la columna `content_language`.
    await extractTrainingTextFromPdf(pdfFile());

    expect(tesseractState.createWorkerCalls[0].langs).toBe('spa');
  });

  it('resolveOcrLanguage traduce el dominio del programa al de Tesseract', () => {
    expect(resolveOcrLanguage('es')).toBe('spa');
    expect(resolveOcrLanguage('en')).toBe('eng');
    expect(resolveOcrLanguage(null)).toBe('spa');
    expect(resolveOcrLanguage(undefined)).toBe('spa');
  });

  it('reporta el resultado con el idioma que se usó', async () => {
    const result = await extractTrainingTextFromPdf(pdfFile(), {
      contentLanguage: 'en',
    });

    expect(result).toMatchObject({ source: 'ocr', language: 'eng' });
  });
});

// ============================================================
// 3. Tope de páginas y parcialidad
// ============================================================

describe('client OCR page limit', () => {
  it('para en el tope y declara el resultado como parcial', async () => {
    pdfState.pageTexts = scannedPages(5);

    const result = await extractTrainingTextFromPdf(pdfFile(), { maxPages: 2 });

    expect(result).toMatchObject({
      source: 'ocr',
      pagesProcessed: 2,
      totalPages: 5,
      partial: true,
    });
    expect(tesseractState.recognizeCalls).toBe(2);
  });

  it('no marca parcialidad cuando el documento cabe en el tope', async () => {
    pdfState.pageTexts = scannedPages(3);

    const result = await extractTrainingTextFromPdf(pdfFile(), { maxPages: 10 });

    expect(result).toMatchObject({
      pagesProcessed: 3,
      totalPages: 3,
      partial: false,
    });
  });

  it('para de reconocer al llegar al tope de caracteres del servidor y lo declara parcial', async () => {
    // Sin este corte, un documento denso completaría minutos de OCR para que el
    // esquema Zod devolviera un 400 por longitud. El tope es el mismo número en
    // los dos lados (`MAX_TRAINING_OCR_TEXT_CHARS`).
    pdfState.pageTexts = scannedPages(10);
    tesseractState.pageText = chars(MAX_TRAINING_OCR_TEXT_CHARS / 2);

    const result = await extractTrainingTextFromPdf(pdfFile(), { maxPages: 10 });

    expect(result).toMatchObject({ source: 'ocr', partial: true });
    if (result.source === 'ocr') {
      expect(result.text.length).toBeLessThanOrEqual(
        MAX_TRAINING_OCR_TEXT_CHARS,
      );
      expect(result.pagesProcessed).toBeLessThan(10);
    }
    // Dos páginas llenan el tope; las ocho restantes no se reconocen.
    expect(tesseractState.recognizeCalls).toBe(2);
  });

  it('resolveOcrPageLimit acota el valor que llega de fuera', () => {
    expect(resolveOcrPageLimit(undefined)).toBe(DEFAULT_OCR_PAGE_LIMIT);
    expect(resolveOcrPageLimit(Number.NaN)).toBe(DEFAULT_OCR_PAGE_LIMIT);
    expect(resolveOcrPageLimit(0)).toBe(1);
    expect(resolveOcrPageLimit(-5)).toBe(1);
    expect(resolveOcrPageLimit(2.7)).toBe(2);
    expect(resolveOcrPageLimit(10_000)).toBe(MAX_OCR_PAGE_LIMIT);
  });
});

// ============================================================
// 4. Progreso
// ============================================================

describe('client OCR progress reporting', () => {
  it('informa de cada fase con la página y el total de la fase', async () => {
    pdfState.pageTexts = scannedPages(2);
    const events: ClientOcrProgress[] = [];

    await extractTrainingTextFromPdf(pdfFile(), {
      onProgress: (progress) => events.push(progress),
    });

    // Lectura de la capa de texto: el total es el del documento.
    expect(events[0]).toEqual({
      phase: 'text-layer',
      page: 1,
      totalPages: 2,
      pageProgress: 0,
    });

    // Carga del motor: sin página, porque todavía no se procesa ninguna. Es la
    // fase larga de la primera vez (descarga del WASM y del idioma) y la
    // interfaz necesita distinguirla de un OCR que ya avanza.
    expect(events).toContainEqual({
      phase: 'loading-engine',
      page: 0,
      totalPages: 2,
      pageProgress: 0,
    });

    expect(events).toContainEqual({
      phase: 'rendering',
      page: 2,
      totalPages: 2,
      pageProgress: 0,
    });

    // El avance intra-página lo emite el motor y llega tal cual, con la página
    // correcta: el logger de Tesseract no sabe en qué página está.
    expect(events).toContainEqual({
      phase: 'recognizing',
      page: 1,
      totalPages: 2,
      pageProgress: 0.5,
    });
    expect(events).toContainEqual({
      phase: 'recognizing',
      page: 2,
      totalPages: 2,
      pageProgress: 0.5,
    });
  });

  it('usa el tope de páginas como total durante el OCR', async () => {
    pdfState.pageTexts = scannedPages(5);
    const events: ClientOcrProgress[] = [];

    await extractTrainingTextFromPdf(pdfFile(), {
      maxPages: 2,
      onProgress: (progress) => events.push(progress),
    });

    const ocrEvents = events.filter((event) => event.phase !== 'text-layer');

    // Contar hasta 5 cuando solo se van a reconocer 2 dejaría la barra parada
    // al 40% para siempre.
    expect(ocrEvents.every((event) => event.totalPages === 2)).toBe(true);
  });
});

// ============================================================
// 5. Liberación del worker y cancelación
// ============================================================

describe('client OCR worker lifecycle', () => {
  it('libera el worker cuando el reconocimiento falla', async () => {
    // Un worker huérfano deja un hilo y su mapa de memoria WASM (decenas de MB)
    // colgando toda la sesión, y el administrador puede reintentar la subida
    // varias veces en la misma pestaña.
    pdfState.pageTexts = scannedPages(3);
    tesseractState.recognizeError = new Error('WASM crash');

    const error = await extractTrainingTextFromPdf(pdfFile()).catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('WASM crash');
    expect(tesseractState.terminateCalls).toBe(1);
    // Y el documento de pdf.js también se cierra en el camino de error.
    expect(pdfState.destroyCalls).toBe(1);
  });

  it('cancela entre páginas y libera el worker', async () => {
    pdfState.pageTexts = scannedPages(4);
    const controller = new AbortController();

    const error = await extractTrainingTextFromPdf(pdfFile(), {
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.phase === 'recognizing' && progress.page === 1) {
          controller.abort();
        }
      },
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ClientOcrAbortedError);
    // Se cancela en cuanto termina la página en curso: Tesseract no permite
    // interrumpir el reconocimiento de una página a media ejecución.
    expect(tesseractState.recognizeCalls).toBe(1);
    expect(tesseractState.terminateCalls).toBe(1);
    expect(pdfState.destroyCalls).toBe(1);
  });

  it('no abre nada si la señal ya venía abortada', async () => {
    const controller = new AbortController();
    controller.abort();

    const error = await extractTrainingTextFromPdf(pdfFile(), {
      signal: controller.signal,
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ClientOcrAbortedError);
    expect(pdfState.destroyCalls).toBe(0);
    expect(tesseractState.createWorkerCalls).toHaveLength(0);
  });
});

// ============================================================
// 6. Rasterizado
// ============================================================

describe('client OCR rasterization', () => {
  it('escala la página hacia ~200 DPI antes de reconocerla', async () => {
    pdfState.pageTexts = scannedPages(1);

    await extractTrainingTextFromPdf(pdfFile());

    // Una página carta (792 pt de alto) rasterizada para que el lado mayor
    // quede cerca de 2.200 px: Tesseract acierta mucho menos a resolución de
    // pantalla, y con imágenes gigantes solo gasta memoria.
    const [canvas] = pdfState.renderedCanvases;
    expect(canvas.height).toBeGreaterThan(2_000);
    expect(canvas.height).toBeLessThanOrEqual(2_300);
    expect(canvas.width).toBeLessThan(canvas.height);
  });

  it('resolveRenderScale no reduce ni infla más de lo razonable', () => {
    // Página carta: se amplía hacia el objetivo.
    expect(resolveRenderScale(612, 792)).toBeCloseTo(2_200 / 792, 5);
    // Página enorme (un plano): nunca se reduce por debajo de 1, porque
    // rasterizar más pequeño que el original destruye texto pequeño.
    expect(resolveRenderScale(5_000, 8_000)).toBe(1);
    // Página minúscula: el tope evita un canvas absurdo.
    expect(resolveRenderScale(50, 50)).toBe(3);
    // Dimensiones inservibles: escala neutra en vez de NaN.
    expect(resolveRenderScale(0, 0)).toBe(1);
  });
});
