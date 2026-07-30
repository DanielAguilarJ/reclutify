import 'server-only';

import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { createAdminClient } from '@/utils/supabase/admin';

import type {
  InfoSessionClientStatus,
  InfoSessionCreateRequest,
  InfoSessionCreateResponse,
  InfoSessionPatch,
  InfoSessionStateRequest,
  InfoSessionStateResponse,
  InfoSessionUpdateRequest,
  InfoSessionWriteResponse,
} from './contracts';

/**
 * Creación, escritura y lectura de estado de una sesión de informes con
 * `service_role`.
 *
 * Este módulo es el único punto del producto que escribe `info_sessions` para un
 * cliente sin cuenta. Corre en el servidor con la clave de servicio, que IGNORA
 * RLS por diseño, así que la autorización la hace el propio código:
 *
 *  - en la creación, el `org_id` NO se acepta del cliente, se deriva del curso;
 *  - en la escritura y en la lectura, la fila se localiza por el par
 *    `{ id, access_token_hash }`, de modo que la credencial forma parte del
 *    filtro y no de un `if` previo que alguien pueda quitar sin darse cuenta.
 *
 * POR QUÉ EL IDENTIFICADOR DE SESIÓN NO BASTA COMO CREDENCIAL
 * -----------------------------------------------------------
 * El `sessionId` es un nombre, no un secreto: viaja al cuerpo de
 * `/api/info-chat`, al de `/api/info-notify`, al nombre del canal de tiempo real
 * y a cualquier log o captura de esos caminos. Aceptarlo como llave de escritura
 * dejaría el mismo agujero que la política `anon_update_own_session
 * USING (true)` que este cambio retira: quien conozca —o adivine— un `sessionId`
 * podría reescribir la sesión de otra persona, solo pasando por una ruta de
 * servidor en lugar de por PostgREST. Por eso toda escritura exige además el
 * `accessToken` que la creación emitió una única vez.
 *
 * POR QUÉ EN LA BASE SOLO SE GUARDA EL HASH
 * -----------------------------------------
 * `access_token_hash` guarda SHA-256 del token, nunca el token. Un volcado de la
 * tabla, una consulta con `service_role` desde otra ruta o un backup filtrado
 * dejan de ser suficientes para escribir en sesiones ajenas: con el hash no se
 * reconstruye la credencial. El token es de 32 bytes aleatorios, así que tampoco
 * hay diccionario que valga; por eso el hash es directo y sin sal, que es lo
 * correcto para un secreto de alta entropía y lo que permite además localizar la
 * fila con un `.eq(...)` indexado.
 */

/** Prefijo estable para filtrar en los logs los rechazos de este flujo. */
const LOG_PREFIX = '[info-session]';

/**
 * Bytes de entropía del token de acceso.
 *
 * 32 bytes son 256 bits, muy por encima de los 128 que el flujo exige. Es una
 * credencial portadora que vive lo que dure la sesión del cliente y no se puede
 * revocar de otra forma que borrando la fila, así que el margen es a propósito.
 */
const ACCESS_TOKEN_BYTES = 32;

/**
 * Estado con el que nace la sesión.
 *
 * Lo fija el servidor y no el cliente: es el valor que el panel del asesor usa
 * para listar las sesiones en curso (`coachStore.fetchActiveSessions` filtra por
 * `status = 'active'`), y es el mismo que ponía `infoSessionStore.createSession`
 * cuando insertaba la fila desde el navegador.
 */
const INITIAL_SESSION_STATUS: InfoSessionClientStatus = 'active';

/**
 * Genera el token de acceso a una sesión de informes.
 *
 * NO reutiliza `generateInviteToken` de `src/lib/invites/token.ts`: ese generador
 * codifica sobre un alfabeto de 32 símbolos legibles a mano porque su token se
 * copia de un correo, y produce 80 bits. Aquí el token no lo lee ni lo teclea
 * nadie —lo guarda el navegador y lo devuelve en el cuerpo de cada escritura—,
 * así que no hay motivo para sacrificar entropía por legibilidad. El helper de
 * bytes de ese módulo es privado y el módulo es isomorfo (Web Crypto); este es
 * `server-only`, así que usa `randomBytes` de `node:crypto`, el CSPRNG de la
 * plataforma.
 *
 * base64url sin relleno para que el token viaje sin escapes por JSON y por
 * cualquier URL, aunque hoy solo viaje en el cuerpo.
 */
export function issueInfoSessionAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString('base64url');
}

/**
 * Hash del token tal como se almacena en `info_sessions.access_token_hash`.
 *
 * Exportada porque es la única forma de comprobar en una prueba que la fila
 * guarda el hash y no el token, y de construir filas de prueba con una
 * credencial conocida.
 */
export function hashInfoSessionAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Resultado de crear una sesión.
 *
 * `error` no forma parte del contrato con el cliente
 * (`infoSessionCreateResponseSchema`): es la señal de que falló la base de datos
 * y de que la ruta debe responder 5xx, no un 404 que afirmaría que el curso no
 * existe.
 */
export type CreateInfoSessionResult = InfoSessionCreateResponse | { status: 'error' };

/** Resultado de una escritura parcial. `error` produce un 5xx, igual que arriba. */
export type UpdateInfoSessionResult = InfoSessionWriteResponse | { status: 'error' };

/** Resultado de la lectura de estado. */
export type ReadInfoSessionStateResult = InfoSessionStateResponse | { status: 'error' };

/** Fila de `courses` que la creación necesita: solo la organización dueña. */
const courseRowSchema = z.looseObject({
  org_id: z.string(),
});

/** Fila insertada: solo el identificador generado. */
const insertedSessionRowSchema = z.looseObject({
  id: z.string(),
});

/** Fila de `info_sessions` que la lectura de estado devuelve. */
const sessionStateRowSchema = z.looseObject({
  status: z.string(),
  coach_notified: z.boolean().nullable(),
});

/**
 * Columnas de `info_sessions` que la escritura del cliente puede tocar.
 *
 * Es la traducción de las claves de `InfoSessionPatch` a nombres de columna, y
 * está escrita como tipo para que añadir una columna aquí sea un cambio
 * deliberado y visible en revisión. `updated_at` es obligatorio porque toda
 * escritura lo refresca.
 */
interface InfoSessionUpdateColumns {
  transcript?: InfoSessionPatch['transcript'];
  objections_detected?: InfoSessionPatch['objectionsDetected'];
  status?: InfoSessionClientStatus;
  closing_mode?: string | null;
  client_email?: string;
  client_phone?: string;
  updated_at: string;
}

/**
 * Crea la fila de la sesión y emite su credencial.
 *
 * El `org_id` se resuelve leyendo `courses` por `id` con `is_active = true`. No
 * se acepta el que traía el navegador: era un valor elegible por el cliente, y
 * bastaba cambiarlo para colgar la sesión —con los datos de contacto del
 * cliente— del panel de una organización ajena. Que el curso tenga que estar
 * activo es la misma condición que ya aplicaba `loadCourse` antes de dejar
 * empezar la sesión.
 *
 * El token se devuelve EN CLARO una sola vez, aquí. Lo que queda en la base es
 * su hash.
 */
export async function createInfoSession(
  input: InfoSessionCreateRequest,
): Promise<CreateInfoSessionResult> {
  const admin = createAdminClient();

  const { data: courseData, error: courseError } = await admin
    .from('courses')
    .select('org_id')
    .eq('id', input.courseId)
    .eq('is_active', true)
    .maybeSingle();

  if (courseError) {
    console.error(`${LOG_PREFIX} course lookup failed:`, courseError.message);
    return { status: 'error' };
  }

  const courseRow = courseRowSchema.safeParse(courseData);

  // Curso inexistente, inactivo o con la organización sin resolver comparten
  // respuesta: en los tres casos no hay sesión que iniciar, y distinguirlos
  // convertiría la ruta en un confirmador de cursos ocultos.
  if (!courseRow.success) return { status: 'course_not_found' };

  const accessToken = issueInfoSessionAccessToken();

  const { data: insertedData, error: insertError } = await admin
    .from('info_sessions')
    .insert({
      course_id: input.courseId,
      org_id: courseRow.data.org_id,
      client_name: input.clientName,
      client_email: input.clientEmail ?? null,
      client_phone: input.clientPhone ?? null,
      client_age: input.clientAge ?? null,
      client_occupation: input.clientOccupation ?? null,
      course_for: input.courseFor ?? null,
      status: INITIAL_SESSION_STATUS,
      access_token_hash: hashInfoSessionAccessToken(accessToken),
    })
    .select('id')
    .single();

  if (insertError) {
    console.error(`${LOG_PREFIX} session insert failed:`, insertError.message);
    return { status: 'error' };
  }

  const insertedRow = insertedSessionRowSchema.safeParse(insertedData);
  if (!insertedRow.success) {
    console.error(`${LOG_PREFIX} session insert returned no identifier`);
    return { status: 'error' };
  }

  return { status: 'created', sessionId: insertedRow.data.id, accessToken };
}

/**
 * Traduce el `patch` validado a columnas, incluyendo solo las claves presentes.
 *
 * Se comprueba `!== undefined` y no la veracidad del valor: `''` en el correo y
 * `null` en el modo de cierre son valores que el flujo envía a propósito, y
 * convertirlos en "no escribir" perdería la intención del cliente.
 */
function toUpdateColumns(patch: InfoSessionPatch, now: string): InfoSessionUpdateColumns {
  const columns: InfoSessionUpdateColumns = { updated_at: now };

  if (patch.transcript !== undefined) columns.transcript = patch.transcript;
  if (patch.objectionsDetected !== undefined) {
    columns.objections_detected = patch.objectionsDetected;
  }
  if (patch.status !== undefined) columns.status = patch.status;
  if (patch.closingMode !== undefined) columns.closing_mode = patch.closingMode;
  if (patch.clientEmail !== undefined) columns.client_email = patch.clientEmail;
  if (patch.clientPhone !== undefined) columns.client_phone = patch.clientPhone;

  return columns;
}

/**
 * Aplica una escritura parcial sobre la sesión que acredita la credencial.
 *
 * La comprobación de la credencial ES el filtro del `UPDATE`: se exige a la vez
 * `id = sessionId` y `access_token_hash = hash(accessToken)`. Si el par no
 * coincide, el `UPDATE` no alcanza ninguna fila y el resultado es `unauthorized`
 * — sin escritura parcial posible, y sin una comprobación previa que alguien
 * pudiera reordenar o eliminar dejando la escritura abierta.
 *
 * Por eso `unauthorized` no distingue entre "esa sesión no existe" y "el token
 * no es de esa sesión": la consulta tampoco lo distingue, y esa opacidad es
 * deseable.
 */
export async function updateInfoSession(
  input: InfoSessionUpdateRequest,
): Promise<UpdateInfoSessionResult> {
  const admin = createAdminClient();

  const columns = toUpdateColumns(input.patch, new Date().toISOString());

  const { data, error } = await admin
    .from('info_sessions')
    .update(columns)
    .eq('id', input.sessionId)
    .eq('access_token_hash', hashInfoSessionAccessToken(input.accessToken))
    .select('id');

  if (error) {
    console.error(`${LOG_PREFIX} session update failed:`, error.message);
    return { status: 'error' };
  }

  if (!Array.isArray(data) || data.length === 0) {
    // Se registra el identificador solicitado, nunca el token ni el contenido
    // del `patch`.
    console.warn(`${LOG_PREFIX} update rejected: credential does not match session`, {
      sessionId: input.sessionId,
    });
    return { status: 'unauthorized' };
  }

  return { status: 'updated' };
}

/**
 * Devuelve el estado de la sesión que acredita la credencial.
 *
 * Es lo que la pantalla del cliente necesita para saber que el asesor la
 * atendió: `status` (la pantalla espera `completed`) y `coach_notified`. Con la
 * lectura anon retirada, el canal de tiempo real deja de servir para eso, y esta
 * ruta lo sustituye sin dar acceso a ninguna otra fila: los dos `.eq(...)` son
 * los mismos que en la escritura.
 *
 * No sale ningún dato más de la fila —ni transcripción, ni datos de contacto, ni
 * `conversion_result`—: el cliente ya tiene lo suyo y esto es lo único que la
 * pantalla consulta.
 */
export async function readInfoSessionState(
  input: InfoSessionStateRequest,
): Promise<ReadInfoSessionStateResult> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('info_sessions')
    .select('status, coach_notified')
    .eq('id', input.sessionId)
    .eq('access_token_hash', hashInfoSessionAccessToken(input.accessToken))
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} session state lookup failed:`, error.message);
    return { status: 'error' };
  }

  const stateRow = sessionStateRowSchema.safeParse(data);
  if (!stateRow.success) {
    console.warn(`${LOG_PREFIX} state read rejected: credential does not match session`, {
      sessionId: input.sessionId,
    });
    return { status: 'unauthorized' };
  }

  return {
    status: 'ok',
    sessionStatus: stateRow.data.status,
    coachNotified: stateRow.data.coach_notified === true,
  };
}
