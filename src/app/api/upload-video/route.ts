import { NextResponse, type NextRequest } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { ApiError, handleApiError } from '@/lib/api/errors';
import { requireInterviewAccess } from '@/lib/api/interview-access';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { uploadVideoRequestSchema } from '@/lib/schemas/interview';

/**
 * POST /api/upload-video — URL prefirmada para subir la grabación de una entrevista.
 *
 * QUÉ ESTABA MAL
 * --------------
 * La versión anterior era, textualmente:
 *
 *     const { filename, contentType } = body;
 *     if (!filename) return 400;
 *     const key = filename;
 *     const command = new PutObjectCommand({ Bucket, Key: key, ContentType });
 *     const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
 *
 * Sin sesión, sin credencial de entrevista y sin ninguna comprobación sobre
 * `filename`. Es decir: **firmaba una escritura en la clave exacta que pidiera
 * quien llamara, para cualquiera, sin autenticarse.** Con una petición se
 * obtenía permiso de escritura de 15 minutos sobre cualquier objeto del bucket:
 *
 *  - Sobrescribir la grabación de cualquier otro candidato, que es la prueba en
 *    la que se apoya la evaluación del reclutador.
 *  - Subir contenido arbitrario con el `Content-Type` que se quisiera. El bucket
 *    se sirve por `R2_PUBLIC_URL`, así que un `text/html` subido ahí es XSS
 *    almacenado en un dominio de la empresa.
 *  - Usar el bucket como almacenamiento gratuito de terceros.
 *
 * CÓMO SE CIERRA
 * --------------
 *  1. **Credencial de entrevista obligatoria.** La misma que exige
 *     `/api/candidate-results`: token de ticket, `public_token` de la vacante o
 *     sesión de la organización dueña. El candidato legítimo ya la tiene en
 *     `interviewStore.accessProof`.
 *  2. **La clave la deriva el SERVIDOR.** El cliente ya no envía `filename`;
 *     envía a qué entrevista pertenece el vídeo (`roleId`, `resultId`) y el
 *     servidor construye la ruta con el `orgId` que la credencial acredita. No
 *     hay forma de escribir fuera del prefijo de la propia organización.
 *  3. **`Content-Type` de lista blanca.** Solo los que produce `MediaRecorder`.
 *     Además se fija en la firma, así que el `PUT` que no lo respete lo rechaza
 *     R2, no nosotros.
 *  4. **Tope de tasa** por credencial: una grabación por entrevista, no mil.
 */

export const runtime = 'nodejs';

/** Prefijo de todas las grabaciones. Aísla este contenido del resto del bucket. */
const VIDEO_KEY_PREFIX = 'interview-recordings';

/**
 * Segmento de ruta seguro.
 *
 * Reduce a `[A-Za-z0-9_-]` y acota la longitud. Esto es lo que impide que un
 * `resultId` como `../../otro-tenant/grabacion` salga del prefijo: los puntos y
 * las barras no sobreviven al filtro, así que no hay travesía posible ni
 * dependemos de detectar secuencias concretas.
 *
 * Se rechaza en lugar de sanear silenciosamente cuando el resultado queda vacío:
 * firmar una URL con un segmento que no corresponde a lo que pidió el cliente
 * produciría una grabación imposible de localizar después.
 */
function toSafePathSegment(raw: string, field: string): string {
  const safe = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);

  if (safe.length === 0) {
    throw ApiError.badRequest(`${field} contains no usable characters`);
  }

  return safe;
}

/**
 * Ruta del objeto en R2.
 *
 * `orgId` va primero y NO viene del cliente: lo resuelve la autorización a
 * partir de la credencial. Es lo que hace que el prefijo sea un límite real
 * entre organizaciones y no una convención de nombres.
 */
function buildInterviewVideoKey(input: {
  orgId: string;
  roleId: string;
  resultId: string;
  extension: string;
}): string {
  const org = toSafePathSegment(input.orgId, 'organization');
  const role = toSafePathSegment(input.roleId, 'roleId');
  const result = toSafePathSegment(input.resultId, 'resultId');

  return `${VIDEO_KEY_PREFIX}/${org}/${role}/${result}.${input.extension}`;
}

/** Configuración de R2, validada de una vez para poder fallar con un mensaje útil. */
function requireR2Config(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
} {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim();

  // La versión anterior construía el `S3Client` en el ámbito del módulo con
  // `|| ''` en las credenciales, así que una configuración ausente no se
  // detectaba al desplegar: se manifestaba como un fallo de firma por petición.
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw ApiError.misconfigured(
      'Video storage is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME and R2_PUBLIC_URL.',
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = uploadVideoRequestSchema.parse(rawBody);

    // La autorización va antes del tope de tasa y antes de tocar R2: un rechazo
    // aquí no consume cuota ajena ni firma nada.
    const access = await requireInterviewAccess(rawBody, body.roleId);

    await enforceRateLimit(req, RATE_LIMITS.FILE_PARSE, access.userId ?? body.resultId);

    const config = requireR2Config();

    const key = buildInterviewVideoKey({
      orgId: access.orgId,
      roleId: access.roleId,
      resultId: body.resultId,
      extension: body.extension,
    });

    const s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });

    const uploadUrl = await getSignedUrl(
      s3Client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        // Fijar el tipo en la firma obliga a que el `PUT` mande exactamente este
        // valor: R2 rechaza el que no coincida. Sin esto, la lista blanca de
        // arriba sería solo una comprobación nuestra, eludible en el `PUT`.
        ContentType: body.contentType,
      }),
      // 15 minutos: suficiente para subir una grabación de una hora con conexión
      // lenta, y corto para que una URL filtrada deje de servir enseguida.
      { expiresIn: 900 },
    );

    return NextResponse.json({
      uploadUrl,
      publicUrl: `${config.publicUrl.replace(/\/+$/, '')}/${key}`,
    });
  } catch (error) {
    return handleApiError(error, '[upload-video]');
  }
}
