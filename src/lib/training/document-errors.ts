import 'server-only';

import { MAX_TRAINING_FILE_SIZE } from './documents';

/**
 * Taxonomía de errores de procesamiento de documentos de capacitación.
 *
 * El módulo separa deliberadamente dos planos (Requisito 2.5):
 *
 * - **Causa técnica** (`TrainingDocumentError.cause` y `message`): se registra
 *   completa en el log del servidor. Puede contener el error de Supabase, el
 *   fallo del parser o cualquier detalle interno.
 * - **Mensaje al cliente** (`DOCUMENT_ERROR_MESSAGES`): texto accionable para
 *   un administrador, derivado únicamente del `code`. Nunca incluye la causa.
 *
 * `toTrainingDocumentFailure` es el único puente entre ambos planos y por
 * construcción descarta `cause`, de modo que ninguna respuesta HTTP pueda
 * filtrar detalles internos.
 *
 * NOTA IMPORTANTE — `NEEDS_OCR` NO es un código de error y no debe añadirse
 * aquí. Un PDF escaneado del que no se pudo extraer texto se guarda con
 * `status: 'needs_ocr'` y **cuenta como documento procesado**: la interfaz lo
 * muestra como advertencia y `readyDocumentsCount` ya lo excluye de la
 * generación de módulos. Reclasificarlo como fallo rompería el Requisito 3.2
 * y el criterio de «procesado» del Requisito 2.1.
 */

// ============================================================
// 1. CÓDIGOS DE ERROR
// ============================================================

export type TrainingDocumentErrorCode =
  | 'FILE_TOO_LARGE'
  | 'FILE_TYPE_MISMATCH'
  | 'STORAGE_UPLOAD_FAILED'
  | 'STORAGE_DOWNLOAD_FAILED'
  | 'TEXT_EXTRACTION_FAILED'
  | 'TEXT_TOO_SHORT'
  | 'DATABASE_INSERT_FAILED'
  | 'CHUNKS_INSERT_FAILED'
  | 'ASSOCIATION_FAILED'
  | 'UNKNOWN';

/** Idiomas soportados por la interfaz de `/admin/training`. */
export type TrainingErrorLanguage = 'es' | 'en';

/**
 * Objeto de fallo que viaja en la respuesta de las rutas de documentos.
 * No tiene campo para la causa técnica de forma intencionada.
 */
export interface TrainingDocumentFailure {
  fileName: string;
  code: TrainingDocumentErrorCode;
  message: string;
}

// ============================================================
// 2. CLASE DE ERROR
// ============================================================

/**
 * Error lanzado por el procesamiento de un documento.
 *
 * `message` y `cause` son para el log del servidor; el texto que ve el
 * administrador se obtiene siempre del `code` vía `DOCUMENT_ERROR_MESSAGES`.
 */
export class TrainingDocumentError extends Error {
  constructor(
    public readonly code: TrainingDocumentErrorCode,
    public readonly fileName: string,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TrainingDocumentError';
  }
}

export function isTrainingDocumentError(
  error: unknown,
): error is TrainingDocumentError {
  return error instanceof TrainingDocumentError;
}

// ============================================================
// 3. MENSAJES POR CÓDIGO E IDIOMA
// ============================================================

/**
 * Etiqueta del límite de tamaño derivada de la constante real, para que el
 * mensaje no se desincronice si `MAX_TRAINING_FILE_SIZE` cambia.
 */
const MAX_TRAINING_FILE_SIZE_LABEL = `${Math.round(
  MAX_TRAINING_FILE_SIZE / (1024 * 1024),
)} MB`;

/**
 * Mensajes accionables para el administrador. Sin jerga técnica: describen qué
 * pasó con el archivo y qué puede hacer al respecto.
 */
export const DOCUMENT_ERROR_MESSAGES: Record<
  TrainingDocumentErrorCode,
  { es: string; en: string }
> = {
  FILE_TOO_LARGE: {
    es: `El archivo excede el máximo de ${MAX_TRAINING_FILE_SIZE_LABEL}. Divídelo en partes más pequeñas antes de subirlo.`,
    en: `The file exceeds the ${MAX_TRAINING_FILE_SIZE_LABEL} maximum. Split it into smaller parts before uploading.`,
  },
  FILE_TYPE_MISMATCH: {
    es: 'El contenido del archivo no coincide con su extensión. Vuelve a exportarlo como PDF, DOCX, TXT o MD.',
    en: 'The file content does not match its extension. Export it again as PDF, DOCX, TXT or MD.',
  },
  STORAGE_UPLOAD_FAILED: {
    es: 'No se pudo guardar el archivo. Vuelve a intentarlo en unos momentos.',
    en: 'The file could not be saved. Try again in a moment.',
  },
  STORAGE_DOWNLOAD_FAILED: {
    es: 'No se pudo recuperar el archivo recién subido. Vuelve a subirlo.',
    en: 'The uploaded file could not be retrieved. Upload it again.',
  },
  TEXT_EXTRACTION_FAILED: {
    es: 'No se pudo leer el contenido del archivo. Comprueba que no esté dañado ni protegido con contraseña.',
    en: 'The file content could not be read. Check that it is not damaged or password protected.',
  },
  TEXT_TOO_SHORT: {
    es: 'El documento no contiene texto suficiente para usarse en capacitación.',
    en: 'The document does not contain enough text to be used for training.',
  },
  DATABASE_INSERT_FAILED: {
    es: 'No se pudo registrar el documento. Revisa el diagnóstico del centro de capacitación.',
    en: 'The document could not be registered. Check the training center diagnostics.',
  },
  CHUNKS_INSERT_FAILED: {
    es: 'No se pudo indexar el contenido del documento. Vuelve a intentarlo.',
    en: 'The document content could not be indexed. Try again.',
  },
  ASSOCIATION_FAILED: {
    es: 'El documento se procesó pero no se pudo asociar al programa. Vuelve a intentarlo.',
    en: 'The document was processed but could not be linked to the program. Try again.',
  },
  UNKNOWN: {
    es: 'No se pudo procesar el documento. Vuelve a intentarlo o revisa el diagnóstico del centro de capacitación.',
    en: 'The document could not be processed. Try again or check the training center diagnostics.',
  },
};

/** Texto para el administrador a partir del código y el idioma activo. */
export function getDocumentErrorMessage(
  code: TrainingDocumentErrorCode,
  language: TrainingErrorLanguage = 'es',
): string {
  const entry =
    DOCUMENT_ERROR_MESSAGES[code] ?? DOCUMENT_ERROR_MESSAGES.UNKNOWN;

  return entry[language];
}

// ============================================================
// 4. CONVERSIÓN A OBJETO DE RESPUESTA
// ============================================================

/**
 * Convierte cualquier error en el objeto que viaja al cliente.
 *
 * Garantías:
 * - `cause` nunca se serializa.
 * - `message` proviene del catálogo por código, no del `message` interno del
 *   error, que puede contener detalles técnicos.
 * - Un error que no sea `TrainingDocumentError` se clasifica como `UNKNOWN`.
 */
export function toTrainingDocumentFailure(
  error: unknown,
  fallbackFileName: string,
  language: TrainingErrorLanguage = 'es',
): TrainingDocumentFailure {
  if (isTrainingDocumentError(error)) {
    return {
      fileName: error.fileName || fallbackFileName,
      code: error.code,
      message: getDocumentErrorMessage(error.code, language),
    };
  }

  return {
    fileName: fallbackFileName,
    code: 'UNKNOWN',
    message: getDocumentErrorMessage('UNKNOWN', language),
  };
}
