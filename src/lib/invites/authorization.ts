import 'server-only';

import { timingSafeEqual } from 'node:crypto';

/**
 * Autenticación de `/api/invite-candidates`.
 *
 * QUÉ SE ARREGLA
 * --------------
 * La comprobación anterior era esta:
 *
 * ```ts
 * const secret = req.headers.get('x-api-key');
 * if (secret && secret !== process.env.MAKE_WEBHOOK_SECRET) {
 *   // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   console.warn("x-api-key did not match MAKE_WEBHOOK_SECRET");
 * }
 * ```
 *
 * Tenía dos fallos independientes, y cada uno bastaba para dejar la ruta
 * abierta:
 *
 *  1. El `return` estaba comentado: una clave incorrecta solo dejaba una
 *     advertencia en el log y la petición seguía su curso.
 *  2. La condición empezaba por `secret &&`: omitir la cabecera saltaba la
 *     comprobación por completo. Era el camino más cómodo para un atacante.
 *
 * Con eso, cualquiera podía crear tickets de entrevista e insertar filas en
 * `candidate_invites` para la organización de cualquier `roleId` — y los
 * `roleId` son públicamente listables porque `roles` tiene la política
 * `anon_roles_select USING (true)`.
 *
 * CÓMO SE DECIDE AHORA
 * --------------------
 * Tres resultados posibles, y ninguno es "aceptar por omisión":
 *
 *  - `503` si `MAKE_WEBHOOK_SECRET` no está configurada. Se comprueba PRIMERO,
 *    a propósito: si el secreto no existe, no hay nada con lo que comparar, y
 *    la única respuesta segura es declarar el endpoint mal configurado. La
 *    alternativa —aceptar mientras no haya secreto— es exactamente el patrón
 *    que causó este fallo.
 *  - `401` si la cabecera `x-api-key` falta o viene vacía.
 *  - `401` si la cabecera no coincide con el secreto configurado.
 *
 * El mensaje del `401` es el mismo en los dos casos: quien llama no necesita
 * saber si el problema fue la ausencia o el valor. El motivo detallado se queda
 * en `reason`, para el log del servidor.
 */

/** Prefijo estable para filtrar los rechazos de autorización en los logs. */
export const PUBLIC_FLOW_AUTH_LOG_PREFIX = '[public-flow-auth]';

/** Motivo del rechazo. Va al log del servidor, no al cliente. */
export type InviteAuthRejection =
  | 'secret-not-configured'
  | 'missing-api-key'
  | 'api-key-mismatch';

export type InviteAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      reason: InviteAuthRejection;
      /** Mensaje apto para devolver al cliente: nunca incluye el secreto. */
      message: string;
    };

/**
 * Compara dos secretos en tiempo constante.
 *
 * `timingSafeEqual` exige que los dos búferes tengan la misma longitud —lanza
 * si no— así que la longitud se compara antes y una diferencia se resuelve como
 * "no coincide". Eso filtra la longitud del secreto configurado por tiempo de
 * respuesta, y es una fuga aceptada: conocer la longitud no acorta de forma
 * útil la búsqueda de un secreto generado al azar, mientras que comparar los
 * bytes con `!==` sí permitiría descubrirlos uno a uno.
 *
 * Se usa `TextEncoder` en lugar de `Buffer` porque el resultado es el mismo
 * (UTF-8) sin depender del ámbito global de Node.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const providedBytes = encoder.encode(provided);
  const expectedBytes = encoder.encode(expected);

  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}

/**
 * Decide si una petición a `/api/invite-candidates` está autenticada.
 *
 * No toca la red ni la base de datos: se ejecuta antes de leer el cuerpo, de
 * modo que un rechazo garantiza cero escrituras.
 *
 * @param providedKey Valor de la cabecera `x-api-key`, o `null` si no viene.
 * @param configuredSecret Valor de `MAKE_WEBHOOK_SECRET` en el entorno.
 */
export function authorizeInviteRequest(
  providedKey: string | null,
  configuredSecret: string | undefined,
): InviteAuthResult {
  // Se recorta el secreto configurado porque un salto de línea o un espacio
  // colado al pegarlo en el panel del proveedor de despliegue haría fallar
  // todas las llamadas legítimas sin ninguna pista del motivo.
  const expected = typeof configuredSecret === 'string' ? configuredSecret.trim() : '';

  if (expected.length === 0) {
    return {
      ok: false,
      status: 503,
      reason: 'secret-not-configured',
      message:
        'Invite endpoint is misconfigured: MAKE_WEBHOOK_SECRET is not set on the server.',
    };
  }

  if (providedKey === null || providedKey.length === 0) {
    return {
      ok: false,
      status: 401,
      reason: 'missing-api-key',
      message: 'Unauthorized',
    };
  }

  if (!secretsMatch(providedKey, expected)) {
    return {
      ok: false,
      status: 401,
      reason: 'api-key-mismatch',
      message: 'Unauthorized',
    };
  }

  return { ok: true };
}
