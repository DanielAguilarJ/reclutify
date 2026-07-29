import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { trainingDocumentUploadMetadataSchema } from '@/lib/training/contracts';
import {
  TrainingDocumentError,
  isTrainingDocumentError,
  toTrainingDocumentFailure,
  type TrainingDocumentFailure,
} from '@/lib/training/document-errors';
import {
  processTrainingDocument,
  type ProcessedTrainingDocument,
} from '@/lib/training/process-document';
import {
  buildTrainingDocumentStoragePath,
  MAX_TRAINING_FILE_SIZE,
  TRAINING_DOCUMENTS_BUCKET,
} from '@/lib/training/documents';

/**
 * Camino heredado de subida de documentos de capacitación.
 *
 * Este endpoint recibe el `multipart/form-data` completo, así que solo sirve
 * para lotes pequeños: la plataforma de despliegue rechaza cuerpos de petición
 * grandes antes de que el handler se ejecute. El transporte nuevo
 * (`documents/upload-url` + `documents/process`) sube el archivo directamente a
 * storage desde el navegador.
 *
 * La lógica de negocio no vive aquí: está en `processTrainingDocument`, que
 * ambos transportes comparten. Esta ruta solo se ocupa del transporte:
 * autorizar, validar el lote, **subir el objeto a storage** y delegar.
 *
 * CAMBIO DE ORDEN RESPECTO A LA VERSIÓN ANTERIOR
 * ----------------------------------------------
 * Antes la deduplicación por `checksum_sha256` ocurría *antes* de subir a
 * storage, de modo que un archivo repetido nunca llegaba al bucket. Con la
 * función compartida el orden se invierte: primero se sube el objeto y después
 * `processTrainingDocument` calcula el checksum y detecta el duplicado, momento
 * en el que **borra el objeto redundante** que se acaba de subir. El resultado
 * observable es el mismo (se reutiliza el documento existente y no queda basura
 * en el bucket) a cambio de una escritura de más en el caso duplicado. No se
 * reintroduce aquí la comprobación previa: duplicaría lógica que ya existe en un
 * solo sitio.
 *
 * REVERSIÓN
 * ---------
 * `processTrainingDocument` revierte lo que crea (fila y objeto). Esta ruta solo
 * es responsable del objeto mientras la función compartida no haya tomado el
 * control, es decir si el propio `upload` falla o si algo revienta entre el
 * `upload` y la llamada.
 */

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const metadataResult = trainingDocumentUploadMetadataSchema.safeParse({
      programId: formData.get('programId'),
      scope: formData.get('scope') ?? 'role',
    });

    if (!metadataResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid upload metadata',
          issues: metadataResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { programId, scope } = metadataResult.data;

    const rawFiles = formData.getAll('files');
    if (!rawFiles || rawFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Limitar lote a máximo 5 archivos
    if (rawFiles.length > 5) {
      return NextResponse.json(
        { error: 'A maximum of 5 files is allowed per request' },
        { status: 400 }
      );
    }

    const files: File[] = [];
    for (const raw of rawFiles) {
      const isFile =
        raw instanceof File ||
        (raw &&
          typeof raw === 'object' &&
          'name' in raw &&
          'size' in raw &&
          'arrayBuffer' in raw);

      if (!isFile) {
        return NextResponse.json({ error: 'All upload elements must be files' }, { status: 400 });
      }
      files.push(raw as File);
    }

    // 1. Validar administrador del programa
    const { program, admin } = await requireProgramAdmin(programId);
    const orgId = program.org_id;
    const roleId = scope === 'role' ? program.role_id : null;

    if (scope === 'role' && !program.role_id) {
      return NextResponse.json({ error: 'Program is not bound to a role vacancy' }, { status: 400 });
    }

    // Guard: solo programas en draft pueden recibir nuevos documentos
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Documents can only be uploaded to draft programs' },
        { status: 409 }
      );
    }

    const processedDocs: ProcessedTrainingDocument[] = [];
    const failures: TrainingDocumentFailure[] = [];

    // Procesar cada archivo de forma independiente: el fallo de uno no
    // interrumpe a los demás.
    for (const file of files) {
      // Ruta del objeto de la que esta iteración sigue siendo responsable.
      // Se pone a null al entregar el control a `processTrainingDocument`.
      let storagePathOwnedByRoute: string | null = null;

      try {
        // Tamaño declarado. El tamaño real de los bytes lo revalida la función
        // compartida; esta comprobación evita bufferizar un archivo enorme.
        if (file.size > MAX_TRAINING_FILE_SIZE) {
          throw new TrainingDocumentError(
            'FILE_TOO_LARGE',
            file.name,
            `El archivo ${file.name} excede el máximo de 15 MB`
          );
        }

        const fileBuffer = Buffer.from(await file.arrayBuffer());

        const documentId = crypto.randomUUID();

        // Derivación compartida con `documents/upload-url` y con
        // `documents/process`, que la recalcula para verificar pertenencia.
        const storagePath = buildTrainingDocumentStoragePath({
          orgId,
          scope,
          roleId,
          documentId,
          fileName: file.name,
        });

        // 2. Subir el objeto. `processTrainingDocument` espera encontrarlo ya
        // en el bucket, así que el upload es responsabilidad del transporte.
        // La ruta se marca como propia antes del intento: si el upload falla a
        // medias, el manejador de abajo borra lo que haya quedado. La colisión
        // es imposible porque `documentId` es nuevo en cada iteración.
        storagePathOwnedByRoute = storagePath;

        const { error: uploadError } = await admin.storage
          .from(TRAINING_DOCUMENTS_BUCKET)
          .upload(storagePath, fileBuffer, { contentType: file.type });

        if (uploadError) {
          throw new TrainingDocumentError(
            'STORAGE_UPLOAD_FAILED',
            file.name,
            'Failed to upload document to storage',
            uploadError
          );
        }

        // 3. Delegar: deduplicación, extracción de texto, IA, fila, fragmentos
        // y asociación con el programa, incluida su reversión.
        const handedOverStoragePath = storagePathOwnedByRoute;
        storagePathOwnedByRoute = null;

        const processedDoc = await processTrainingDocument({
          admin,
          orgId,
          roleId,
          scope,
          programId,
          documentId,
          storagePath: handedOverStoragePath,
          fileName: file.name,
          fileBuffer,
          fileType: file.type,
        });

        processedDocs.push(processedDoc);
      } catch (fileErr: unknown) {
        // La causa técnica se queda en el log del servidor (Requisito 2.5);
        // `toTrainingDocumentFailure` garantiza que no viaje en la respuesta.
        console.error('[Upload API] File failed', {
          code: isTrainingDocumentError(fileErr) ? fileErr.code : 'UNKNOWN',
          fileName: file.name,
          cause: fileErr,
        });

        // Solo queda por limpiar si el fallo ocurrió antes de delegar.
        if (storagePathOwnedByRoute) {
          const { error: cleanupError } = await admin.storage
            .from(TRAINING_DOCUMENTS_BUCKET)
            .remove([storagePathOwnedByRoute]);

          if (cleanupError) {
            console.error('[Upload API] Storage cleanup failed', {
              fileName: file.name,
              cause: cleanupError,
            });
          }
        }

        failures.push(toTrainingDocumentFailure(fileErr, file.name));
      }
    }

    // Fallo total: `success: false` y 422, para que `res.ok` recupere su
    // significado en el cliente (Requisito 2.1). Un solo archivo procesado
    // basta para considerar la petición exitosa, con sus fallos adjuntos.
    if (processedDocs.length === 0) {
      return NextResponse.json(
        {
          success: false,
          documents: [],
          failures,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      documents: processedDocs,
      failures,
    });
  } catch (error: unknown) {
    return trainingApiErrorResponse(error, '[Upload API] Unexpected error');
  }
}
