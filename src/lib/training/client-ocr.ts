'use client';

import {
  DEFAULT_TRAINING_CONTENT_LANGUAGE,
  type TrainingContentLanguage,
} from '@/lib/training/content-language';
import {
  hasSufficientTrainingText,
  MAX_TRAINING_OCR_TEXT_CHARS,
} from '@/lib/training/document-text';

/**
 * OCR de PDF escaneados **en el navegador**.
 *
 * POR QUÉ EN EL NAVEGADOR Y NO EN EL SERVIDOR
 * -------------------------------------------
 * Un PDF escaneado no tiene capa de texto: `extractPdfText` devuelve casi nada y
 * `processTrainingDocument` lo deja en `status: 'needs_ocr'`. Ahí moría el
 * documento: sin fragmentos, sin tutor y fuera de la generación de módulos.
 *
 * El OCR podría vivir en el servidor, pero no cabe: la función de
 * `/api/training/documents/process` se ejecuta bajo un techo de 60 s que el plan
 * de la plataforma **no** amplía por declarar `maxDuration`, y un OCR de
 * servidor tendría que rasterizar cada página y pasarla por WASM dentro de ese
 * techo, además de engordar el bundle de la función con el motor y los datos de
 * idioma. En el navegador el trabajo lo hace la máquina del administrador, no
 * hay techo de tiempo, no hay claves ni cuotas de un tercero, y encaja con el
 * transporte actual, donde el archivo ya viaja del navegador a Storage con una
 * URL firmada.
 *
 * DÓNDE ENCAJA EN EL FLUJO
 * ------------------------
 * La pantalla de configuración llama a `extractTrainingTextFromPdf` entre la
 * subida (paso 2) y el procesamiento (paso 3). Si el PDF trae capa de texto no
 * se ejecuta OCR y el servidor extrae el texto como siempre; si no la trae, el
 * texto reconocido viaja en el campo opcional `ocrText` de
 * `POST /api/training/documents/process`.
 *
 * DEPENDENCIAS Y CARGA DIFERIDA
 * -----------------------------
 * `pdfjs-dist` y `tesseract.js` pesan megabytes entre JavaScript, WASM y datos
 * de idioma. Las dos se cargan con `import()` **dentro** de las funciones, de
 * modo que la pantalla de configuración no las arrastra en su bundle inicial:
 * quien nunca sube un PDF escaneado nunca las descarga.
 *
 * `pdfjs-dist/webpack.mjs` es el entry point que publica pdf.js para
 * empaquetadores: importa `./build/pdf.mjs` y cablea el worker con
 * `new Worker(new URL('./build/pdf.worker.mjs', import.meta.url), { type: 'module' })`.
 * Se usa ese entry, y no `pdfjs-dist` a secas, precisamente para no fijar a mano
 * `GlobalWorkerOptions.workerSrc`: la ruta relativa dentro del paquete la
 * resuelve el empaquetador (Turbopack incluido) y el worker sale del mismo
 * origen, sin depender de un CDN ni de que la versión del worker coincida a mano
 * con la de la API.
 *
 * `tesseract.js` sí resuelve por CDN, y a propósito: su `workerPath` por defecto
 * apunta a jsDelivr **fijado a la versión instalada** del paquete, y el núcleo
 * WASM y los `traineddata` de cada idioma se descargan de sus CDN oficiales la
 * primera vez (después quedan en la caché del navegador). Es la configuración
 * que la librería documenta para el navegador y evita vendorizar ~20 MB de datos
 * de idioma en el repositorio. `tesseractPaths` permite servirlos desde el
 * propio origen si algún despliegue lo necesita.
 */

// ============================================================
// 1. PARÁMETROS
// ============================================================

/**
 * Tope de páginas que se pasan por OCR.
 *
 * Un OCR ronda los segundos por página, así que 40 páginas ya son minutos de
 * trabajo con la pestaña abierta. El tope evita que un PDF de 500 páginas
 * congele el navegador sin avisar; cuando se alcanza, el resultado lo declara
 * (`partial: true`) y la interfaz lo dice, en vez de fingir que el documento se
 * procesó entero.
 */
export const DEFAULT_OCR_PAGE_LIMIT = 40;

/** Límite duro: por encima de esto el navegador es un mal sitio para esto. */
export const MAX_OCR_PAGE_LIMIT = 200;

/**
 * Lado mayor de la imagen que se le entrega a Tesseract, en píxeles.
 *
 * Tesseract acierta bastante más con ~200 DPI que con la resolución de pantalla,
 * y bastante menos si la imagen es gigante (memoria y tiempo crecen con el área
 * sin mejorar el reconocimiento). Una página tamaño carta a 2.200 px de alto
 * queda alrededor de 200 DPI.
 */
const OCR_TARGET_LONG_EDGE_PX = 2_200;

/** Tope de escala, para que un PDF con páginas minúsculas no se infle. */
const OCR_MAX_RENDER_SCALE = 3;

// ============================================================
// 2. TIPOS PÚBLICOS
// ============================================================

/** Códigos de idioma de Tesseract que soporta el producto. */
export type ClientOcrLanguage = 'spa' | 'eng';

export type ClientOcrPhase =
  /** Leyendo la capa de texto del PDF para decidir si hace falta OCR. */
  | 'text-layer'
  /** Descargando e inicializando el motor de OCR. */
  | 'loading-engine'
  /** Rasterizando una página a imagen. */
  | 'rendering'
  /** Reconociendo el texto de una página. */
  | 'recognizing';

export interface ClientOcrProgress {
  phase: ClientOcrPhase;
  /** Página en curso, 1-based. `0` cuando la fase no es de página. */
  page: number;
  /** Páginas que se van a recorrer en la fase actual. */
  totalPages: number;
  /** Avance dentro de la página, entre 0 y 1, cuando el motor lo informa. */
  pageProgress: number;
}

export interface ClientPdfTextOptions {
  /**
   * Idioma del contenido del programa. Determina el idioma del OCR; si no llega,
   * se usa el defecto del producto (español).
   */
  contentLanguage?: TrainingContentLanguage | null;
  /** Tope de páginas a reconocer. Por defecto `DEFAULT_OCR_PAGE_LIMIT`. */
  maxPages?: number;
  /** Cancelación cooperativa: se comprueba entre páginas. */
  signal?: AbortSignal;
  onProgress?: (progress: ClientOcrProgress) => void;
  /**
   * Rutas alternativas para servir el motor de OCR desde el propio origen.
   * Sin valores, se usan los defectos de `tesseract.js` (CDN oficial).
   */
  tesseractPaths?: {
    workerPath?: string;
    corePath?: string;
    langPath?: string;
  };
}

/**
 * Resultado de la inspección del PDF.
 *
 * Es una unión discriminada a propósito: **solo** la variante `ocr` lleva texto.
 * El texto de la capa de texto no se devuelve porque no debe enviarse al
 * servidor —para ese caso el servidor extrae el suyo, que sí corresponde a los
 * bytes del archivo—, y una forma que no lo expone hace imposible confundirse.
 */
export type ClientPdfTextResult =
  | {
      source: 'text-layer';
      /** Páginas que hizo falta leer para confirmar que hay capa de texto. */
      pagesScanned: number;
      totalPages: number;
    }
  | {
      source: 'ocr';
      text: string;
      language: ClientOcrLanguage;
      pagesProcessed: number;
      totalPages: number;
      /**
       * `true` si el resultado no cubre el documento entero, sea porque el tope
       * de páginas dejó páginas sin reconocer o porque el texto llegó al tope de
       * caracteres que acepta el servidor.
       */
      partial: boolean;
    };

/** Cancelación solicitada por quien llamó. No es un fallo del documento. */
export class ClientOcrAbortedError extends Error {
  constructor() {
    super('Client OCR aborted');
    this.name = 'ClientOcrAbortedError';
  }
}

/** El OCR no pudo producir texto utilizable (páginas en blanco, escaneo ilegible). */
export class ClientOcrEmptyResultError extends Error {
  constructor(
    public readonly pagesProcessed: number,
    public readonly totalPages: number,
  ) {
    super('Client OCR produced no usable text');
    this.name = 'ClientOcrEmptyResultError';
  }
}

// ============================================================
// 3. FORMA MÍNIMA DE LAS DOS LIBRERÍAS
// ============================================================

/**
 * Solo lo que este módulo usa de `pdfjs-dist`. Se declara en lugar de importar
 * los tipos internos del paquete (`pdfjs-dist/types/src/...`) por dos razones:
 * el entry point de empaquetador (`webpack.mjs`) no publica declaraciones
 * propias, y así las pruebas pueden sustituir la librería con un doble que
 * satisface exactamente este contrato y nada más.
 */
interface PdfViewportLike {
  width: number;
  height: number;
}

interface PdfTextItemLike {
  str?: string;
}

interface PdfTextContentLike {
  items: ReadonlyArray<PdfTextItemLike | Record<string, unknown>>;
}

interface PdfPageLike {
  getTextContent(): Promise<PdfTextContentLike>;
  getViewport(params: { scale: number }): PdfViewportLike;
  render(params: {
    canvas: HTMLCanvasElement;
    viewport: PdfViewportLike;
  }): { promise: Promise<void> };
  cleanup?: () => void;
}

interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
  destroy(): Promise<void>;
}

interface PdfJsLike {
  getDocument(params: { data: Uint8Array }): {
    promise: Promise<PdfDocumentLike>;
  };
}

/** Solo lo que este módulo usa de `tesseract.js`. */
interface TesseractLoggerMessage {
  status?: string;
  progress?: number;
}

interface TesseractWorkerLike {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

interface TesseractLike {
  createWorker(
    langs: string,
    oem?: number,
    options?: {
      workerPath?: string;
      corePath?: string;
      langPath?: string;
      logger?: (message: TesseractLoggerMessage) => void;
    },
  ): Promise<TesseractWorkerLike>;
}

// ============================================================
// 4. DECISIONES PURAS (probables sin navegador)
// ============================================================

/**
 * Idioma del OCR a partir del idioma de contenido del programa.
 *
 * El dominio del programa es `'es' | 'en'` y el de Tesseract `'spa' | 'eng'`.
 * Cualquier valor ausente o desconocido cae en el defecto del producto, que es
 * el mismo que el de la columna `training_programs.content_language`.
 */
export function resolveOcrLanguage(
  contentLanguage?: TrainingContentLanguage | null,
): ClientOcrLanguage {
  const language = contentLanguage ?? DEFAULT_TRAINING_CONTENT_LANGUAGE;

  return language === 'en' ? 'eng' : 'spa';
}

/** Tope de páginas efectivo: entero, al menos 1 y como mucho `MAX_OCR_PAGE_LIMIT`. */
export function resolveOcrPageLimit(maxPages?: number): number {
  if (typeof maxPages !== 'number' || !Number.isFinite(maxPages)) {
    return DEFAULT_OCR_PAGE_LIMIT;
  }

  const floored = Math.floor(maxPages);

  if (floored < 1) {
    return 1;
  }

  return Math.min(floored, MAX_OCR_PAGE_LIMIT);
}

/** Escala de rasterizado para que el lado mayor quede cerca del objetivo. */
export function resolveRenderScale(width: number, height: number): number {
  const longEdge = Math.max(width, height);

  if (!Number.isFinite(longEdge) || longEdge <= 0) {
    return 1;
  }

  const scale = OCR_TARGET_LONG_EDGE_PX / longEdge;

  return Math.min(Math.max(scale, 1), OCR_MAX_RENDER_SCALE);
}

// ============================================================
// 5. CARGA DIFERIDA DE LAS LIBRERÍAS
// ============================================================

async function loadPdfJs(): Promise<PdfJsLike> {
  // Entry point de empaquetador: cablea el worker de pdf.js por sí solo (ver el
  // bloque de cabecera). El `import()` es dinámico para que la librería quede en
  // su propio chunk.
  const pdfjs = await import('pdfjs-dist/webpack.mjs');

  return pdfjs as unknown as PdfJsLike;
}

async function loadTesseract(): Promise<TesseractLike> {
  const tesseract = await import('tesseract.js');

  return tesseract as unknown as TesseractLike;
}

// ============================================================
// 6. UTILIDADES INTERNAS
// ============================================================

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ClientOcrAbortedError();
  }
}

function readTextItems(content: PdfTextContentLike): string {
  const parts: string[] = [];

  for (const item of content.items) {
    // La lista mezcla items de texto con items de marca
    // (`beginMarkedContent`), que no traen `str`.
    const candidate = 'str' in item ? item.str : undefined;

    if (typeof candidate === 'string' && candidate.length > 0) {
      parts.push(candidate);
    }
  }

  return parts.join(' ');
}

/**
 * Libera la memoria del canvas.
 *
 * Un canvas de 2.200 px de lado ocupa ~20 MB de mapa de bits. Cuarenta páginas
 * sin liberar son 800 MB y una pestaña que se cae; poner las dimensiones a cero
 * es la forma de decirle al navegador que puede reclamar el mapa de bits sin
 * esperar al recolector.
 */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

// ============================================================
// 7. ENTRADA PÚBLICA
// ============================================================

/**
 * Decide si un PDF necesita OCR y, si lo necesita, lo ejecuta.
 *
 * Orden de trabajo:
 *
 * 1. **Capa de texto.** Se recorren las páginas acumulando texto y se para en
 *    cuanto se alcanza `MIN_TRAINING_TEXT_CHARS` (el mismo umbral que aplica el
 *    servidor, importado del mismo módulo). Si se alcanza, se devuelve
 *    `source: 'text-layer'` **sin texto**: ese caso lo resuelve el servidor con
 *    los bytes reales y no hay nada que enviarle. El corte temprano hace que un
 *    PDF normal cueste una o dos páginas de lectura, no el documento entero.
 * 2. **OCR.** Solo si tras recorrer *todas* las páginas el texto no llega al
 *    umbral. Recorrer el documento completo antes de decidir es lo que mantiene
 *    el criterio idéntico al del servidor, que mira el texto total.
 *
 * @throws {ClientOcrAbortedError} si `signal` se aborta.
 * @throws {ClientOcrEmptyResultError} si el OCR no produce texto suficiente.
 * @throws Cualquier error de carga o de parseo de las librerías: el llamador
 *   decide qué hacer (en la interfaz, seguir sin OCR y dejar `needs_ocr`).
 */
export async function extractTrainingTextFromPdf(
  file: File,
  options: ClientPdfTextOptions = {},
): Promise<ClientPdfTextResult> {
  const { signal, onProgress } = options;

  throwIfAborted(signal);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjs = await loadPdfJs();
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  try {
    const totalPages = pdf.numPages;

    // ── Fase 1: capa de texto ──
    let accumulated = '';

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      throwIfAborted(signal);

      onProgress?.({
        phase: 'text-layer',
        page: pageNumber,
        totalPages,
        pageProgress: 0,
      });

      const page = await pdf.getPage(pageNumber);

      try {
        const content = await page.getTextContent();
        accumulated += `${readTextItems(content)}\n`;
      } finally {
        page.cleanup?.();
      }

      if (hasSufficientTrainingText(accumulated)) {
        return {
          source: 'text-layer',
          pagesScanned: pageNumber,
          totalPages,
        };
      }
    }

    // ── Fase 2: OCR ──
    return await recognizePages(pdf, totalPages, options);
  } finally {
    // `destroy` cierra el worker de pdf.js y libera los buffers del documento.
    await pdf.destroy().catch(() => undefined);
  }
}

/**
 * Rasteriza y reconoce las páginas del documento.
 *
 * El worker de Tesseract se libera en `finally`, así que se libera también
 * cuando el reconocimiento falla o se cancela: un worker huérfano deja un hilo y
 * su mapa de memoria WASM (decenas de MB) colgando durante toda la sesión, y el
 * administrador puede repetir la subida varias veces en la misma pestaña.
 */
async function recognizePages(
  pdf: PdfDocumentLike,
  totalPages: number,
  options: ClientPdfTextOptions,
): Promise<ClientPdfTextResult> {
  const { signal, onProgress, tesseractPaths } = options;

  const language = resolveOcrLanguage(options.contentLanguage);
  const pageLimit = resolveOcrPageLimit(options.maxPages);
  const pagesToProcess = Math.min(totalPages, pageLimit);

  onProgress?.({
    phase: 'loading-engine',
    page: 0,
    totalPages: pagesToProcess,
    pageProgress: 0,
  });

  const { createWorker } = await loadTesseract();

  // El logger de Tesseract informa del avance de la página en curso. Necesita
  // saber cuál es, y el worker se crea una sola vez para todo el documento
  // (reinicializarlo por página volvería a cargar el modelo de idioma), así que
  // la página viaja en una variable del cierre.
  let currentPage = 0;

  const worker = await createWorker(language, undefined, {
    ...tesseractPaths,
    logger: (message: TesseractLoggerMessage) => {
      if (message.status !== 'recognizing text') {
        return;
      }

      onProgress?.({
        phase: 'recognizing',
        page: currentPage,
        totalPages: pagesToProcess,
        pageProgress:
          typeof message.progress === 'number' ? message.progress : 0,
      });
    },
  });

  const parts: string[] = [];
  // Páginas efectivamente reconocidas. Puede quedarse por debajo de
  // `pagesToProcess` si el texto llega antes al tope de caracteres.
  let pagesRecognized = 0;
  let accumulatedChars = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      // La cancelación es cooperativa y entre páginas: Tesseract no expone forma
      // de interrumpir el reconocimiento de una página a media ejecución.
      throwIfAborted(signal);

      currentPage = pageNumber;

      onProgress?.({
        phase: 'rendering',
        page: pageNumber,
        totalPages: pagesToProcess,
        pageProgress: 0,
      });

      const page = await pdf.getPage(pageNumber);
      const canvas = document.createElement('canvas');

      try {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = resolveRenderScale(baseViewport.width, baseViewport.height);
        const viewport = page.getViewport({ scale });

        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));

        await page.render({ canvas, viewport }).promise;

        throwIfAborted(signal);

        const { data } = await worker.recognize(canvas);

        if (typeof data.text === 'string' && data.text.trim().length > 0) {
          const pageText = data.text.trim();
          parts.push(pageText);
          accumulatedChars += pageText.length + 2; // + el separador de páginas
        }

        pagesRecognized = pageNumber;
      } finally {
        releaseCanvas(canvas);
        page.cleanup?.();
      }

      // El servidor rechaza un `ocrText` por encima de este tope, así que seguir
      // reconociendo páginas solo gastaría minutos para acabar en un 400.
      if (accumulatedChars >= MAX_TRAINING_OCR_TEXT_CHARS) {
        break;
      }
    }
  } finally {
    await worker.terminate().catch(() => undefined);
  }

  const joined = parts.join('\n\n').trim();
  // El recorte es del tamaño exacto que el esquema Zod acepta (que valida sobre
  // el texto ya recortado), de modo que el cuerpo nunca se rechaza por longitud.
  const text =
    joined.length > MAX_TRAINING_OCR_TEXT_CHARS
      ? joined.slice(0, MAX_TRAINING_OCR_TEXT_CHARS).trim()
      : joined;

  if (!hasSufficientTrainingText(text)) {
    throw new ClientOcrEmptyResultError(pagesRecognized, totalPages);
  }

  return {
    source: 'ocr',
    text,
    language,
    pagesProcessed: pagesRecognized,
    totalPages,
    partial: pagesRecognized < totalPages || text.length < joined.length,
  };
}
