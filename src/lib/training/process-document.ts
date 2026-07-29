import 'server-only';

import * as mammoth from 'mammoth';

import { extractPdfText } from '@/lib/pdf-text';
import {
  analyzeTrainingDocumentText,
  buildPartialAnalysisNotice,
} from '@/lib/training/document-analysis';
import { TrainingDocumentError } from '@/lib/training/document-errors';
import { hasSufficientTrainingText } from '@/lib/training/document-text';
import {
  detectTrainingFileKind,
  sanitizeTrainingFileName,
  sha256,
  splitTrainingText,
  MAX_TRAINING_FILE_SIZE,
  type TrainingFileKind,
} from '@/lib/training/documents';
import type { createAdminClient } from '@/utils/supabase/admin';

/**
 * Procesamiento de un documento de capacitación, compartido por los dos
 * transportes de subida.
 *
 * FRONTERA DEL UPLOAD — importante
 * --------------------------------
 * Esta función **no sube el archivo a storage**. Asume que el objeto ya existe
 * en `training-documents` bajo `storagePath`:
 *
 * - Transporte nuevo (subida directa): el navegador subió el objeto con una URL
 *   firmada antes de llamar a `POST /api/training/documents/process`.
 * - Transporte heredado (`POST /api/training/documents`): la ruta recibe el
 *   `multipart/form-data`, sube el objeto y luego llama aquí.
 *
 * Por eso `STORAGE_UPLOAD_FAILED` nunca se lanza desde este módulo: pertenece
 * al llamador que hace el `upload`. Lo que sí hace esta función es **borrar** el
 * objeto de `storagePath` cuando el intento no culmina, para no dejar huérfanos
 * en el bucket en ninguno de los dos transportes.
 *
 * REVERSIÓN
 * ---------
 * La función revierte exactamente lo que se creó para *este* `documentId`:
 * el objeto en `storagePath` y la fila de `training_documents` insertada en
 * esta llamada (los fragmentos caen por `ON DELETE CASCADE`). Nunca toca un
 * documento preexistente reutilizado por deduplicación. La reversión deja de
 * aplicarse en cuanto la asociación con el programa queda establecida, igual
 * que en la ruta heredada original.
 */

// ============================================================
// 1. TIPOS
// ============================================================

/** Cliente admin de Supabase, tal como lo devuelve `requireProgramAdmin`. */
export type TrainingAdminClient = ReturnType<typeof createAdminClient>;

export type TrainingDocumentScope = 'role' | 'organization';

export type TrainingDocumentStatus = 'ready' | 'needs_ocr' | 'failed';

export interface ProcessTrainingDocumentInput {
  admin: TrainingAdminClient;
  orgId: string;
  roleId: string | null;
  scope: TrainingDocumentScope;
  programId: string;
  documentId: string;
  /** Ruta del objeto ya presente en el bucket `training-documents`. */
  storagePath: string;
  /** Nombre original del archivo; se sanea antes de persistirse. */
  fileName: string;
  fileBuffer: Buffer;
  /**
   * MIME declarado por el cliente, opcional.
   *
   * El transporte heredado sí tiene `File.type` y lo pasa, de modo que la fila
   * conserva el mismo `file_type` que hoy. El transporte nuevo no tiene `File`,
   * así que se deriva del `fileKind` detectado sobre los bytes. En ambos casos
   * la validación real la hace `detectTrainingFileKind` con la firma binaria.
   */
  fileType?: string;
  /**
   * Texto reconocido por el OCR del navegador para un PDF escaneado.
   *
   * Solo el transporte nuevo lo aporta, y solo cuando el PDF no tenía capa de
   * texto. Su uso está restringido en `applyClientOcrText`: no sustituye nunca a
   * la extracción del servidor cuando esta funciona. Ver la consideración de
   * confianza documentada junto a esa función.
   */
  ocrText?: string;
}

/** Forma del documento que las rutas devuelven al cliente. */
export interface ProcessedTrainingDocument {
  id: string;
  orgId: string;
  roleId?: string;
  scope: TrainingDocumentScope;
  fileName: string;
  fileType: string | null;
  fileSize?: number;
  aiSummary?: string;
  aiTopics: unknown[];
  status: TrainingDocumentStatus;
  processingError?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fila de `training_documents` en la forma que devuelve `select('*')`. */
interface TrainingDocumentRow {
  id: string;
  org_id: string;
  role_id: string | null;
  scope: TrainingDocumentScope;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string | null;
  ai_summary: string | null;
  ai_topics: unknown[] | null;
  status: TrainingDocumentStatus;
  processing_error: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// 2. TIPO DE ARCHIVO Y MIME
// ============================================================

const TRAINING_BUCKET = 'training-documents';

/** MIME canónico por tipo detectado, usado cuando el cliente no declara uno. */
const TRAINING_FILE_KIND_MIME_TYPES: Record<TrainingFileKind, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  text: 'text/plain',
  markdown: 'text/markdown',
};

const TRAINING_EXTENSION_MIME_TYPES: ReadonlyArray<{
  extension: string;
  mimeType: string;
}> = [
  { extension: '.pdf', mimeType: TRAINING_FILE_KIND_MIME_TYPES.pdf },
  { extension: '.docx', mimeType: TRAINING_FILE_KIND_MIME_TYPES.docx },
  { extension: '.txt', mimeType: TRAINING_FILE_KIND_MIME_TYPES.text },
  { extension: '.md', mimeType: TRAINING_FILE_KIND_MIME_TYPES.markdown },
];

/**
 * MIME candidato a partir de la extensión, solo para alimentar a
 * `detectTrainingFileKind` cuando no hay `File.type`. No es una validación:
 * la firma binaria sigue siendo la que decide.
 */
function inferMimeTypeFromFileName(fileName: string): string {
  const lowerName = fileName.toLowerCase();

  const match = TRAINING_EXTENSION_MIME_TYPES.find((entry) =>
    lowerName.endsWith(entry.extension),
  );

  return match?.mimeType ?? '';
}

// ============================================================
// 3. EXTRACCIÓN DE TEXTO
// ============================================================

async function extractTrainingText(
  fileKind: TrainingFileKind,
  fileBuffer: Buffer,
): Promise<string> {
  if (fileKind === 'pdf') {
    // El extractor centralizado documenta por qué no se importa `pdf-parse`
    // directamente (su `index.js` hace IO en tiempo de carga). Sus errores se
    // propagan: el llamante los clasifica como `TEXT_EXTRACTION_FAILED`.
    return await extractPdfText(fileBuffer);
  }

  if (fileKind === 'docx') {
    const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
    return parsed.value;
  }

  if (fileKind === 'text' || fileKind === 'markdown') {
    return fileBuffer.toString('utf-8');
  }

  return '';
}

// ============================================================
// 3.b TEXTO DE OCR APORTADO POR EL CLIENTE
// ============================================================

/**
 * Marca informativa de que el texto del documento vino del OCR del navegador.
 *
 * Va en `processing_error`, que ya es un campo informativo y no solo de error
 * (lo usa `needs_ocr` con el documento perfectamente guardado, y lo usa el aviso
 * de análisis parcial), y que la API expone como `processingError`. No hace falta
 * ninguna columna nueva ni migración: el `status` de estos documentos es `ready`
 * —se indexan y sirven para el tutor y la generación de módulos— y en esa rama
 * `processing_error` estaba libre.
 */
const OCR_PROVENANCE_NOTICE =
  'Texto obtenido por OCR en el navegador (el PDF no tenía capa de texto).';

interface ClientOcrDecision {
  /** Texto que se persistirá: el del servidor, o el del OCR si procede. */
  text: string;
  /** `true` solo si el texto del cliente se usó de verdad. */
  applied: boolean;
}

/**
 * Decide si el texto de OCR del cliente sustituye al del servidor.
 *
 * REGLA
 * -----
 * Se usa **solo** cuando se cumplen las tres condiciones a la vez:
 *
 * 1. la extracción del servidor no alcanza el umbral (`MIN_TRAINING_TEXT_CHARS`),
 * 2. el archivo es PDF —el único tipo cuyo fallo de extracción significa «está
 *    escaneado»; un DOCX o un TXT sin texto es un documento vacío, no un
 *    escaneo—, y
 * 3. el texto del cliente llega y por sí solo alcanza el umbral.
 *
 * Para un PDF con capa de texto **manda siempre el servidor**: su texto proviene
 * de los bytes que están en el bucket, y aceptar el del cliente por delante
 * abriría la puerta a sustituir el contenido de un documento legible.
 *
 * CONSIDERACIÓN DE CONFIANZA
 * --------------------------
 * Este es el único sitio del pipeline donde `extracted_text` **no** se deriva de
 * los bytes del archivo: lo envía el cliente. Es decir, el texto indexado puede
 * no corresponder al PDF almacenado, y quien mire el documento en Storage podría
 * no encontrar lo que el tutor cita.
 *
 * Es aceptable aquí por dos razones concretas, no por conveniencia:
 *
 * - **Quien lo envía ya controla el contenido.** El cuerpo llega autenticado y
 *   autorizado por `requireProgramAdmin` (owner/admin de la organización del
 *   programa) y solo sobre un programa en borrador. Ese mismo administrador
 *   puede subir cualquier PDF con cualquier texto dentro: la capacidad de
 *   decidir qué dice el material de capacitación ya era suya. El OCR de cliente
 *   no le concede ningún privilegio que no tuviera, solo le ahorra el paso de
 *   fabricar el archivo.
 * - **El texto ya se trata como no confiable en todo el pipeline de IA.** Los
 *   prompts de `document-analysis`, `module-generation` y `chat` insertan el
 *   contenido de los documentos delimitado y etiquetado como material de
 *   referencia, nunca como instrucciones.
 *
 * Y lo que **no** cambia: seguir aceptando este texto no habilita inyección de
 * instrucciones al modelo, porque la delimitación de los prompts es la misma que
 * ya se aplica al texto extraído de cualquier PDF. Tampoco cruza organizaciones:
 * `storagePath` sigue verificándose contra el programa en la ruta, y este texto
 * se persiste en el documento que esa misma petición está creando.
 *
 * Lo que sí exige es dejar constancia: el documento queda marcado con
 * `OCR_PROVENANCE_NOTICE` para que el administrador sepa, al leer la lista de
 * documentos, que ese texto no salió de la extracción del servidor.
 */
export function applyClientOcrText(input: {
  serverText: string;
  ocrText: string | undefined;
  fileKind: TrainingFileKind;
}): ClientOcrDecision {
  const { serverText, ocrText, fileKind } = input;

  if (hasSufficientTrainingText(serverText)) {
    return { text: serverText, applied: false };
  }

  if (fileKind !== 'pdf') {
    return { text: serverText, applied: false };
  }

  if (typeof ocrText !== 'string' || !hasSufficientTrainingText(ocrText)) {
    return { text: serverText, applied: false };
  }

  return { text: ocrText.trim(), applied: true };
}

// ============================================================
// 4. ANÁLISIS OPCIONAL CON IA
// ============================================================

/**
 * El análisis con IA vive en `@/lib/training/document-analysis`.
 *
 * Aquí había una única llamada a OpenRouter con el texto recortado a pelo
 * (`extractedText.substring(0, 30_000)`): un manual de 100 páginas se resumía a
 * partir de sus primeras doce y el resultado se guardaba en `ai_summary` y
 * `ai_topics` **sin ninguna marca de parcialidad**, así que el administrador lo
 * leía como si describiera el documento completo.
 *
 * `analyzeTrainingDocumentText` procesa el texto **entero** con map-reduce
 * dentro de un presupuesto de tiempo total, y devuelve además la cobertura real
 * (`partial`, `analyzedChars`, `blocksAnalyzed`) para que este módulo pueda
 * dejarla escrita en la fila. La degradación no bloqueante es la de siempre:
 * nunca lanza y el documento se guarda igual (Requisito 3.7).
 */

// ============================================================
// 5. MAPEO DE LA FILA A LA RESPUESTA
// ============================================================

function toProcessedTrainingDocument(
  row: TrainingDocumentRow,
): ProcessedTrainingDocument {
  return {
    id: row.id,
    orgId: row.org_id,
    roleId: row.role_id || undefined,
    scope: row.scope,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size || undefined,
    aiSummary: row.ai_summary || undefined,
    aiTopics: row.ai_topics || [],
    status: row.status,
    processingError: row.processing_error || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================
// 6. PROCESAMIENTO DEL DOCUMENTO
// ============================================================

/**
 * Procesa un documento ya presente en storage y lo asocia al programa.
 *
 * Puntos de fallo y código asociado:
 * - tamaño real por encima del límite → `FILE_TOO_LARGE`
 * - la firma binaria no coincide con la extensión → `FILE_TYPE_MISMATCH`
 * - fallo del parser de texto → `TEXT_EXTRACTION_FAILED`
 * - consulta o inserción en `training_documents` → `DATABASE_INSERT_FAILED`
 * - inserción de fragmentos → `CHUNKS_INSERT_FAILED`
 * - consulta o creación de la asociación → `ASSOCIATION_FAILED`
 *
 * `needs_ocr` y `failed` **no** son errores: el documento se guarda con ese
 * estado y cuenta como procesado. `TEXT_TOO_SHORT` existe en la taxonomía para
 * un posible rechazo futuro y aquí no se usa, para no alterar el
 * comportamiento actual.
 */
export async function processTrainingDocument(
  input: ProcessTrainingDocumentInput,
): Promise<ProcessedTrainingDocument> {
  const {
    admin,
    orgId,
    roleId,
    scope,
    programId,
    documentId,
    storagePath,
    fileName,
    fileBuffer,
  } = input;

  // Estado de reversión de esta llamada.
  let createdDocumentId: string | null = null;
  let storageObjectPending = true;
  let associationEstablished = false;

  const removeStorageObject = async (reason: string): Promise<void> => {
    storageObjectPending = false;

    const { error: removeError } = await admin.storage
      .from(TRAINING_BUCKET)
      .remove([storagePath]);

    if (removeError) {
      console.error(
        `[training/process-document] Storage cleanup failed (${reason}):`,
        removeError,
      );
    }
  };

  const rollbackPartialWork = async (): Promise<void> => {
    if (associationEstablished) {
      return;
    }

    if (createdDocumentId) {
      const { error: rollbackDocumentError } = await admin
        .from('training_documents')
        .delete()
        .eq('id', createdDocumentId);

      if (rollbackDocumentError) {
        console.error(
          '[training/process-document] Document rollback failed:',
          rollbackDocumentError,
        );
      }
    }

    if (storageObjectPending) {
      await removeStorageObject('rollback');
    }
  };

  try {
    // ── 6.1 Validación del tamaño real de los bytes ──
    if (fileBuffer.length > MAX_TRAINING_FILE_SIZE) {
      throw new TrainingDocumentError(
        'FILE_TOO_LARGE',
        fileName,
        `El archivo ${fileName} excede el máximo de 15 MB`,
      );
    }

    // ── 6.2 Tipo real: extensión, MIME y firma binaria ──
    const declaredFileType =
      input.fileType ?? inferMimeTypeFromFileName(fileName);

    const fileKind = detectTrainingFileKind(
      fileName,
      declaredFileType,
      fileBuffer,
    );

    if (!fileKind) {
      throw new TrainingDocumentError(
        'FILE_TYPE_MISMATCH',
        fileName,
        'File extension, MIME type and content do not match',
      );
    }

    // El MIME persistido conserva el del cliente cuando existe y, si no,
    // se deriva del tipo detectado sobre los bytes.
    const resolvedFileType =
      input.fileType ?? TRAINING_FILE_KIND_MIME_TYPES[fileKind];

    const checksum = sha256(fileBuffer);
    const safeFileName = sanitizeTrainingFileName(fileName);

    // ── 6.3 Deduplicación por checksum dentro de org_id y scope ──
    const getExistingDuplicate = async () => {
      let duplicateQuery = admin
        .from('training_documents')
        .select('*')
        .eq('org_id', orgId)
        .eq('scope', scope)
        .eq('checksum_sha256', checksum);

      if (scope === 'organization') {
        duplicateQuery = duplicateQuery.is('role_id', null);
      } else {
        duplicateQuery = duplicateQuery.eq('role_id', roleId);
      }

      return await duplicateQuery.maybeSingle();
    };

    const { data: existingDoc, error: duplicateError } =
      await getExistingDuplicate();

    if (duplicateError) {
      throw new TrainingDocumentError(
        'DATABASE_INSERT_FAILED',
        fileName,
        'Duplicate lookup on training_documents failed',
        duplicateError,
      );
    }

    let finalDocRow: TrainingDocumentRow;
    let isExisting = false;
    let effectiveDocumentId = documentId;

    if (existingDoc) {
      // Reutilizar el documento existente. El objeto recién subido es
      // redundante: se borra para no dejar huérfanos en el bucket.
      finalDocRow = existingDoc as TrainingDocumentRow;
      effectiveDocumentId = finalDocRow.id;
      isExisting = true;

      if (finalDocRow.storage_path === storagePath) {
        storageObjectPending = false;
      } else {
        await removeStorageObject('duplicate checksum');
      }
    } else {
      // ── 6.4 Extracción de texto ──
      let extractedText = '';
      try {
        extractedText = await extractTrainingText(fileKind, fileBuffer);
      } catch (parseErr: unknown) {
        const parseErrMsg =
          parseErr instanceof Error ? parseErr.message : 'Unknown parsing error';

        throw new TrainingDocumentError(
          'TEXT_EXTRACTION_FAILED',
          fileName,
          `Failed to parse file: ${parseErrMsg}`,
          parseErr,
        );
      }

      // ── 6.4.b Texto de OCR del navegador, si procede ──
      // `applyClientOcrText` documenta la regla y la consideración de confianza.
      // Aquí solo interesa que, si se aplica, el documento sigue el camino normal
      // desde este punto: estado `ready`, fragmentos y análisis con IA.
      const ocrDecision = applyClientOcrText({
        serverText: extractedText,
        ocrText: input.ocrText,
        fileKind,
      });

      extractedText = ocrDecision.text;

      // ── 6.5 Estado según el texto obtenido ──
      // Un PDF sin texto suficiente queda en `needs_ocr`; cualquier otro tipo
      // queda en `failed`. Ninguno de los dos es un error: el documento se
      // guarda y cuenta como procesado.
      let docStatus: TrainingDocumentStatus = 'ready';
      let processingError: string | null = ocrDecision.applied
        ? OCR_PROVENANCE_NOTICE
        : null;

      if (!hasSufficientTrainingText(extractedText)) {
        if (fileKind === 'pdf') {
          docStatus = 'needs_ocr';
          processingError = 'El PDF parece escaneado y requiere OCR.';
        } else {
          docStatus = 'failed';
          processingError = 'El documento no contiene texto suficiente.';
        }
      }

      // ── 6.6 Análisis con IA, opcional y no bloqueante ──
      let aiSummary = '';
      let aiTopics: unknown[] = [];

      if (docStatus === 'ready' && hasSufficientTrainingText(extractedText)) {
        const analysis = await analyzeTrainingDocumentText(
          extractedText,
          fileName,
        );
        aiSummary = analysis.aiSummary;
        aiTopics = analysis.aiTopics;

        // La parcialidad se hace visible en los dos sitios donde el
        // administrador puede leer este análisis, y en ninguno más:
        //
        // 1. `ai_summary`, encabezado por la nota. Es el campo que la lista de
        //    documentos muestra, y el aviso viaja pegado al texto que podría
        //    engañar, de modo que ningún consumidor futuro pueda leer el
        //    resumen sin leer la advertencia.
        // 2. `processing_error`, que ya es un campo informativo y no solo de
        //    error (lo usa `needs_ocr`, con el documento perfectamente
        //    guardado) y que la API expone como `processingError`.
        //
        // No hace falta ninguna columna nueva: aquí `status` sigue siendo
        // `ready` —el documento se indexó completo y sirve para el tutor y para
        // la generación de módulos— y `processing_error` está libre, porque en
        // esta rama nunca se rellenó.
        if (analysis.partial) {
          const notice = buildPartialAnalysisNotice(analysis);
          aiSummary = `${notice.summaryPrefix}${aiSummary}`;
          // Los dos avisos caben en el mismo campo y ninguno puede tapar al
          // otro: la procedencia del texto y la cobertura del análisis son
          // hechos independientes y el administrador necesita los dos.
          processingError = ocrDecision.applied
            ? `${OCR_PROVENANCE_NOTICE} ${notice.processingError}`
            : notice.processingError;

          console.warn(
            `[training/process-document] Partial AI analysis (${notice.coveragePercent}%, ` +
              `${analysis.blocksAnalyzed}/${analysis.blocksTotal} blocks) for file:`,
            fileName,
          );
        }
      }

      // ── 6.7 Fila en training_documents ──
      const nowIso = new Date().toISOString();
      const { data: newDoc, error: insertDocError } = await admin
        .from('training_documents')
        .insert({
          id: documentId,
          org_id: orgId,
          role_id: roleId,
          scope,
          file_name: safeFileName,
          file_type: resolvedFileType,
          file_size: fileBuffer.length,
          storage_path: storagePath,
          extracted_text: extractedText,
          ai_summary: aiSummary || null,
          ai_topics: aiTopics,
          status: docStatus,
          processing_error: processingError,
          checksum_sha256: checksum,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select('*')
        .maybeSingle();

      if (insertDocError || !newDoc) {
        // El objeto ya no tiene fila que lo respalde.
        await removeStorageObject('document insert failed');

        if (!insertDocError) {
          throw new TrainingDocumentError(
            'DATABASE_INSERT_FAILED',
            fileName,
            'DOCUMENT_INSERT_RETURNED_NO_ROW',
          );
        }

        // Carrera con otra subida del mismo checksum: reutilizar el ganador.
        if (insertDocError.code !== '23505') {
          throw new TrainingDocumentError(
            'DATABASE_INSERT_FAILED',
            fileName,
            'Insert into training_documents failed',
            insertDocError,
          );
        }

        const retryDuplicate = await getExistingDuplicate();

        if (retryDuplicate.error) {
          throw new TrainingDocumentError(
            'DATABASE_INSERT_FAILED',
            fileName,
            'Duplicate lookup retry on training_documents failed',
            retryDuplicate.error,
          );
        }

        if (!retryDuplicate.data) {
          throw new TrainingDocumentError(
            'DATABASE_INSERT_FAILED',
            fileName,
            'Insert into training_documents failed',
            insertDocError,
          );
        }

        finalDocRow = retryDuplicate.data as TrainingDocumentRow;
        effectiveDocumentId = finalDocRow.id;
        isExisting = true;
      } else {
        finalDocRow = newDoc as TrainingDocumentRow;
        // La fila se insertó con `documentId`, así que la asociación y los
        // fragmentos siguen usando ese identificador, igual que la ruta actual.
        effectiveDocumentId = documentId;
        createdDocumentId = documentId;
      }

      // ── 6.8 Fragmentos, solo para documentos nuevos en estado ready ──
      if (!isExisting && docStatus === 'ready') {
        const chunks = splitTrainingText(extractedText);
        const chunkRows = chunks.map((chunk, index) => ({
          document_id: documentId,
          chunk_index: index,
          content: chunk,
          metadata: { file_name: safeFileName, scope, role_id: roleId },
        }));

        if (chunkRows.length > 0) {
          const { error: chunksError } = await admin
            .from('training_document_chunks')
            .insert(chunkRows);

          if (chunksError) {
            throw new TrainingDocumentError(
              'CHUNKS_INSERT_FAILED',
              fileName,
              'Insert into training_document_chunks failed',
              chunksError,
            );
          }
        }
      }
    }

    // ── 6.9 Asociación con el programa, con sort_order consecutivo ──
    const { data: existingAssoc, error: existingAssocError } = await admin
      .from('training_program_documents')
      .select('program_id')
      .eq('program_id', programId)
      .eq('document_id', effectiveDocumentId)
      .maybeSingle();

    if (existingAssocError) {
      throw new TrainingDocumentError(
        'ASSOCIATION_FAILED',
        fileName,
        'PROGRAM_DOCUMENT_ASSOCIATION_QUERY_FAILED',
        existingAssocError,
      );
    }

    if (existingAssoc) {
      associationEstablished = true;
    } else {
      const { data: maxAssoc, error: maxAssocError } = await admin
        .from('training_program_documents')
        .select('sort_order')
        .eq('program_id', programId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (maxAssocError) {
        throw new TrainingDocumentError(
          'ASSOCIATION_FAILED',
          fileName,
          'PROGRAM_DOCUMENT_SORT_ORDER_FAILED',
          maxAssocError,
        );
      }

      const nextSortOrder = maxAssoc ? (maxAssoc.sort_order ?? 0) + 1 : 0;

      const { error: assocError } = await admin
        .from('training_program_documents')
        .insert({
          program_id: programId,
          document_id: effectiveDocumentId,
          sort_order: nextSortOrder,
          required: true,
        });

      if (assocError) {
        throw new TrainingDocumentError(
          'ASSOCIATION_FAILED',
          fileName,
          'Insert into training_program_documents failed',
          assocError,
        );
      }

      associationEstablished = true;
    }

    return toProcessedTrainingDocument(finalDocRow);
  } catch (error: unknown) {
    // La causa técnica completa queda en el log del servidor; el llamador
    // traduce el código a un mensaje para el administrador.
    console.error(
      `[training/process-document] File failed: ${fileName}`,
      error,
    );

    await rollbackPartialWork();

    if (error instanceof TrainingDocumentError) {
      throw error;
    }

    throw new TrainingDocumentError(
      'UNKNOWN',
      fileName,
      error instanceof Error
        ? error.message
        : 'Unknown training document processing error',
      error,
    );
  }
}
