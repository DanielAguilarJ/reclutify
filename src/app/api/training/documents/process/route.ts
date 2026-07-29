import { NextRequest, NextResponse } from 'next/server';

import { requireProgramAdmin } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { trainingDocumentProcessSchema } from '@/lib/training/contracts';
import {
  TrainingDocumentError,
  isTrainingDocumentError,
  toTrainingDocumentFailure,
} from '@/lib/training/document-errors';
import {
  processTrainingDocument,
  type ProcessedTrainingDocument,
  type TrainingAdminClient,
} from '@/lib/training/process-document';
import {
  buildTrainingDocumentStoragePath,
  TRAINING_DOCUMENTS_BUCKET,
} from '@/lib/training/documents';

/**
 * Paso 3 de la subida en tres pasos: procesar un objeto ya subido.
 *
 * ESTA RUTA ES LA FRONTERA DE CONFIANZA DE LA SUBIDA DIRECTA
 * ---------------------------------------------------------
 * Al mover la transferencia del archivo al navegador, el servidor deja de ver
 * los bytes en el momento de la subida. Entre el paso 1 (emisión de la URL
 * firmada) y este paso 3 no hay nada que garantice que lo que hay en el bucket
 * sea lo que se anunció: quien tenga la URL firmada pudo escribir **cualquier
 * cosa** en esa ruta, y quien llame a esta ruta puede declarar **cualquier**
 * `storagePath`. Todo el riesgo que el diseño acepta al sacar la subida del
 * servidor se cierra aquí, con dos comprobaciones:
 *
 * 1. **La ruta declarada debe ser la ruta que el servidor habría emitido.**
 *    `storagePath` llega del cliente y no se usa tal cual. Se reconstruye la
 *    ruta esperada con `buildTrainingDocumentStoragePath`, la misma derivación
 *    que usó `upload-url`, alimentada con el `org_id` y el `role_id` del
 *    programa que el usuario administra —no con datos del cuerpo— y se compara.
 *    Si no coincide, se responde `400` y **no se descarga nada**. Sin esta
 *    comprobación, un administrador legítimo de la organización A podría
 *    escribir `storagePath` de la organización B y hacer que el servidor, que
 *    usa el cliente admin y por tanto elude RLS, descargue ese objeto, extraiga
 *    su texto y lo persista en un documento de la organización A. Es una fuga
 *    entre organizaciones con una sola línea de JSON.
 *
 * 2. **La validación real de los bytes ocurre después de descargar.**
 *    El tamaño efectivo y la firma binaria los comprueba
 *    `processTrainingDocument` (`MAX_TRAINING_FILE_SIZE` y
 *    `detectTrainingFileKind`), no esta ruta: duplicar ahí esa lógica
 *    permitiría que las dos copias divergieran. Lo que sí garantiza esta ruta
 *    es que un objeto rechazado **no se queda en el bucket**, porque nadie más
 *    va a limpiarlo: la fila nunca existió y el navegador ya terminó su parte.
 *
 * Un archivo por petición: la duración es predecible (`maxDuration = 60`, con
 * el análisis de IA acotado a 45 s dentro de `processTrainingDocument`) y el
 * fallo de un archivo no arrastra a los demás del lote.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Descarga el objeto que el navegador subió con la URL firmada.
 *
 * Un fallo aquí no es un fallo del documento: significa que el objeto no está
 * donde el cliente dice, o que storage no responde. En ambos casos el
 * administrador puede volver a subirlo, así que se traduce a
 * `STORAGE_DOWNLOAD_FAILED` y la causa técnica se queda en el log.
 */
async function downloadUploadedObject(
  admin: TrainingAdminClient,
  storagePath: string,
  fileName: string,
): Promise<Buffer> {
  const { data: blob, error: downloadError } = await admin.storage
    .from(TRAINING_DOCUMENTS_BUCKET)
    .download(storagePath);

  if (downloadError || !blob) {
    throw new TrainingDocumentError(
      'STORAGE_DOWNLOAD_FAILED',
      fileName,
      'Could not download the uploaded object from storage',
      downloadError,
    );
  }

  return Buffer.from(await blob.arrayBuffer());
}

export async function POST(req: NextRequest) {
  try {
    const parsed = trainingDocumentProcessSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid document metadata',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { programId, scope, documentId, storagePath, fileName } = parsed.data;

    // 1. Autorizar: 401 sin sesión, 403 sin rol owner/admin en la organización
    // del programa, 404 si el programa no existe.
    const { program, admin } = await requireProgramAdmin(programId);

    const orgId = program.org_id;

    // 2. Solo los borradores aceptan documentos nuevos (Requisito 3.8). Se
    // comprueba de nuevo aquí y no solo en `upload-url` porque el programa pudo
    // publicarse entre la firma de la URL y esta llamada.
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Documents can only be uploaded to draft programs' },
        { status: 409 },
      );
    }

    // 3. `scope: 'role'` necesita vacante: sin ella no hay segmento de ruta.
    if (scope === 'role' && !program.role_id) {
      return NextResponse.json(
        { error: 'Program is not bound to a role vacancy' },
        { status: 400 },
      );
    }

    const roleId = scope === 'role' ? program.role_id : null;

    // 4. COMPROBACIÓN DE PERTENENCIA DE LA RUTA — ver el bloque de cabecera.
    //
    // La ruta esperada se deriva de datos del servidor: `orgId` y `roleId` salen
    // del programa que la autorización acaba de cargar. Del cuerpo solo entran
    // `documentId`, que el esquema obliga a ser UUID, y `fileName`, que
    // `buildTrainingDocumentStoragePath` sanea (así que no puede aportar `/`
    // ni `..`). El resultado es que el cliente no tiene ningún grado de libertad
    // para apuntar fuera de `{orgId}/{scope|roleId}/`.
    //
    // La comparación es de igualdad exacta a propósito: un `startsWith` sobre el
    // prefijo de la organización dejaría pasar rutas de otros documentos de la
    // misma organización, y con ello reprocesar un objeto ajeno bajo un
    // `documentId` distinto.
    const expectedStoragePath = buildTrainingDocumentStoragePath({
      orgId,
      scope,
      roleId,
      documentId,
      fileName,
    });

    if (storagePath !== expectedStoragePath) {
      // La ruta declarada se registra para poder investigar el intento, pero no
      // se devuelve al cliente: confirmarle qué ruta esperaba el servidor le
      // daría material para afinar el siguiente intento.
      console.error('[training/process] Storage path does not match program', {
        programId,
        orgId,
        documentId,
        declaredStoragePath: storagePath,
      });

      return NextResponse.json(
        { error: 'Storage path does not belong to this program' },
        { status: 400 },
      );
    }

    // 5. Descargar. A partir de aquí trabajamos con los bytes reales, no con lo
    // que el cliente declaró. Si la descarga falla no se borra nada: el objeto
    // puede no existir (nada que borrar) o storage puede estar respondiendo mal
    // de forma transitoria, y borrar en ese caso destruiría una subida legítima
    // que el administrador podría reprocesar.
    const fileBuffer = await downloadUploadedObject(admin, storagePath, fileName);

    let processedDocument: ProcessedTrainingDocument;

    try {
      // 6. Delegar: tamaño real, firma binaria, checksum y deduplicación,
      // extracción de texto, IA opcional, fila, fragmentos y asociación.
      // Esta ruta no repite ninguna de esas validaciones.
      processedDocument = await processTrainingDocument({
        admin,
        orgId,
        roleId,
        scope,
        programId,
        documentId,
        storagePath,
        fileName,
        fileBuffer,
      });
    } catch (processingError: unknown) {
      // 7. Ningún objeto rechazado se queda en el bucket.
      //
      // `processTrainingDocument` ya intenta borrarlo en su reversión, pero solo
      // registra el fallo si el borrado falla. Esta ruta es el punto donde el
      // objeto quedaría huérfano de verdad —sin fila que lo referencie y sin
      // cliente que vuelva a intentarlo—, así que repite el borrado en lugar de
      // confiar en el de la función compartida. Es idempotente: borrar una ruta
      // ya inexistente no es un error en Supabase Storage.
      const { error: cleanupError } = await admin.storage
        .from(TRAINING_DOCUMENTS_BUCKET)
        .remove([storagePath]);

      if (cleanupError) {
        console.error('[training/process] Storage cleanup failed', {
          storagePath,
          cause: cleanupError,
        });
      }

      throw processingError;
    }

    return NextResponse.json({
      success: true,
      document: processedDocument,
    });
  } catch (error: unknown) {
    // Fallo de procesamiento: 422 con el código de la taxonomía y un mensaje
    // accionable. `toTrainingDocumentFailure` descarta `cause` por
    // construcción, así que la causa técnica solo existe en el log
    // (Requisito 2.5).
    if (isTrainingDocumentError(error)) {
      console.error('[training/process] Document failed', {
        code: error.code,
        fileName: error.fileName,
        cause: error,
      });

      return NextResponse.json(
        {
          success: false,
          failure: toTrainingDocumentFailure(error, error.fileName),
        },
        { status: 422 },
      );
    }

    // Errores de autorización y cualquier otra cosa: 401/403/404 vía
    // TrainingAuthError, 500 genérico en el resto.
    return trainingApiErrorResponse(
      error,
      '[training/process] Unexpected failure',
    );
  }
}
