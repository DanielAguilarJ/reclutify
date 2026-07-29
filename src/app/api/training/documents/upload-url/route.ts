import { NextRequest, NextResponse } from 'next/server';

import { requireProgramAdmin } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { trainingDocumentUploadUrlSchema } from '@/lib/training/contracts';
import {
  buildTrainingDocumentStoragePath,
  MAX_TRAINING_FILE_SIZE,
  TRAINING_DOCUMENTS_BUCKET,
} from '@/lib/training/documents';

/**
 * Paso 1 de la subida en tres pasos.
 *
 * POR QUÉ EXISTE ESTA RUTA
 * ------------------------
 * La plataforma de despliegue rechaza peticiones cuyo cuerpo excede ~4.5 MB, y
 * lo hace antes de que el handler se ejecute. El camino heredado
 * (`POST /api/training/documents`) recibe el `multipart/form-data` completo, así
 * que un solo PDF de tamaño realista no llega nunca al servidor. Aquí la
 * petición y la respuesta son JSON pequeño: el archivo viaja del navegador
 * directamente a Supabase Storage con la URL firmada que se devuelve, y el techo
 * efectivo vuelve a ser el `file_size_limit` del bucket.
 *
 * Los pasos 2 y 3 son la subida directa desde el navegador con
 * `uploadToSignedUrl` y `POST /api/training/documents/process`, que descarga el
 * objeto y ejecuta la validación real sobre los bytes.
 */

export const runtime = 'nodejs';

const MAX_TRAINING_FILE_SIZE_MB = Math.round(
  MAX_TRAINING_FILE_SIZE / (1024 * 1024),
);

/**
 * Extensiones aceptadas. Es una comprobación temprana y económica sobre el
 * nombre declarado, para no emitir una URL de subida por un archivo que se va a
 * rechazar de todos modos. No dice nada sobre el contenido: la verificación por
 * firma binaria la hace `processTrainingDocument` en el paso 3, y es la que
 * decide.
 */
const ALLOWED_TRAINING_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'] as const;

function hasAllowedExtension(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();

  return ALLOWED_TRAINING_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
}

export async function POST(req: NextRequest) {
  try {
    const parsed = trainingDocumentUploadUrlSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid upload metadata',
          issues: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const { programId, scope, fileName, fileSize } = parsed.data;

    // 1. Autorizar: lanza TrainingAuthError con 401 sin sesión, 403 sin rol
    // owner/admin, 404 si el programa no existe.
    const { program, admin } = await requireProgramAdmin(programId);

    const orgId = program.org_id;

    // 2. Solo los borradores aceptan documentos nuevos (Requisito 3.8).
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Documents can only be uploaded to draft programs' },
        { status: 409 },
      );
    }

    // 3. `scope: 'role'` necesita una vacante asociada: sin ella no hay
    // segmento de ruta ni `role_id` que persistir.
    if (scope === 'role' && !program.role_id) {
      return NextResponse.json(
        { error: 'Program is not bound to a role vacancy' },
        { status: 400 },
      );
    }

    const roleId = scope === 'role' ? program.role_id : null;

    // 4. Tamaño declarado. Rechazar aquí evita emitir una URL de subida por un
    // archivo que el bucket o el paso de procesamiento van a rechazar.
    if (fileSize > MAX_TRAINING_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `El archivo ${fileName} excede el máximo de ${MAX_TRAINING_FILE_SIZE_MB} MB`,
          code: 'FILE_TOO_LARGE',
          maxFileSize: MAX_TRAINING_FILE_SIZE,
        },
        { status: 413 },
      );
    }

    if (!hasAllowedExtension(fileName)) {
      return NextResponse.json(
        {
          error: `Solo se aceptan archivos ${ALLOWED_TRAINING_EXTENSIONS.join(', ')}`,
          code: 'FILE_TYPE_MISMATCH',
        },
        { status: 400 },
      );
    }

    // 5. `documentId` se genera **en el servidor**, no lo elige el cliente.
    // Toda la ruta de destino se deriva de él y de la organización del programa,
    // así que la URL firmada solo habilita escribir en una ruta que el servidor
    // decidió. Si el cliente pudiera proponer la ruta, podría sobrescribir el
    // objeto de otro documento o de otra organización.
    const documentId = crypto.randomUUID();

    // Derivación compartida con el camino heredado y con `documents/process`:
    // {orgId}/{scope|roleId}/{documentId}/{nombreSaneado}. `process` recalcula
    // esta misma ruta para verificar que el objeto que recibe es el que se
    // autorizó aquí, así que las dos derivaciones tienen que ser literalmente
    // la misma función.
    const storagePath = buildTrainingDocumentStoragePath({
      orgId,
      scope,
      roleId,
      documentId,
      fileName,
    });

    const { data: signed, error: signedUrlError } = await admin.storage
      .from(TRAINING_DOCUMENTS_BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signedUrlError || !signed) {
      // La causa técnica se queda en el log del servidor (Requisito 2.5).
      console.error('[training/upload-url] Signed upload URL failed', {
        storagePath,
        cause: signedUrlError,
      });

      return NextResponse.json(
        { error: 'Could not create the upload URL' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      documentId,
      storagePath,
      signedUrl: signed.signedUrl,
      token: signed.token,
    });
  } catch (error: unknown) {
    return trainingApiErrorResponse(
      error,
      '[training/upload-url] Unexpected failure',
    );
  }
}
