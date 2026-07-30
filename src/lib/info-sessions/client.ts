import {
  infoSessionCreateResponseSchema,
  infoSessionStateResponseSchema,
  infoSessionWriteResponseSchema,
  type InfoSessionCreateRequest,
  type InfoSessionCreateResponse,
  type InfoSessionStateRequest,
  type InfoSessionStateResponse,
  type InfoSessionUpdateRequest,
  type InfoSessionWriteResponse,
} from './contracts';

/**
 * Cliente de navegador de las tres rutas de la sesión de informes.
 *
 * `/informes/[courseId]` ya no habla con Supabase para su propia sesión: pide a
 * estas funciones lo que antes insertaba, actualizaba y escuchaba por el canal de
 * tiempo real con la clave anon. La respuesta se valida con el MISMO esquema que
 * usa el servidor para construirla, así que el store trabaja con datos tipados sin
 * `any` y sin confiar en la forma del JSON recibido.
 *
 * NINGUNA DE LAS TRES LANZA. La sesión de informes es una conversación en curso:
 * una excepción por un fallo de red dejaría al cliente con la pantalla a medias
 * por algo que el flujo ya sabe tolerar. Cada función traduce el fallo al estado
 * de rechazo de su contrato, que es el que el store ya tiene que manejar.
 *
 * `cache: 'no-store'` en las tres: la credencial viaja en el cuerpo y la respuesta
 * de estado cambia cada pocos segundos. Ninguna debe quedar en una caché.
 */

export const INFO_SESSION_CREATE_PATH = '/api/info-sessions';
export const INFO_SESSION_SYNC_PATH = '/api/info-sessions/sync';
export const INFO_SESSION_STATE_PATH = '/api/info-sessions/state';

/**
 * `POST` con cuerpo JSON, devolviendo el cuerpo sin interpretar.
 *
 * Lanza si la red falla o si la respuesta no es JSON; cada función pública decide
 * qué estado de rechazo corresponde a ese fallo.
 */
async function postToInfoSessionRoute(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  return await response.json();
}

/**
 * Crea la sesión y recoge la credencial que emite el servidor.
 *
 * Cualquier fallo se traduce a `course_not_found`, que es lo que el store ya
 * trataba como "no se pudo iniciar la sesión": el resultado observable para el
 * cliente es el mismo que antes cuando el `INSERT` fallaba.
 */
export async function createInfoSession(
  input: InfoSessionCreateRequest,
): Promise<InfoSessionCreateResponse> {
  try {
    const raw = await postToInfoSessionRoute(INFO_SESSION_CREATE_PATH, input);
    const parsed = infoSessionCreateResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data : { status: 'course_not_found' };
  } catch {
    return { status: 'course_not_found' };
  }
}

/**
 * Aplica una escritura parcial sobre la sesión acreditada por la credencial.
 *
 * El fallo se traduce a `unauthorized`. El store descarta el resultado —la
 * sincronización de transcripción siempre falló en silencio para no interrumpir la
 * conversación—, pero se devuelve para poder registrarlo y para las pruebas.
 */
export async function syncInfoSession(
  input: InfoSessionUpdateRequest,
): Promise<InfoSessionWriteResponse> {
  try {
    const raw = await postToInfoSessionRoute(INFO_SESSION_SYNC_PATH, input);
    const parsed = infoSessionWriteResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data : { status: 'unauthorized' };
  } catch {
    return { status: 'unauthorized' };
  }
}

/**
 * Consulta el estado de la sesión para saber si el asesor ya la atendió.
 *
 * El fallo se traduce a `unauthorized`, que para quien sondea significa "todavía
 * no hay nada que mostrar": el sondeo sigue y un corte de red pasajero no fija
 * por error el aviso de asesor atendido.
 */
export async function fetchInfoSessionState(
  input: InfoSessionStateRequest,
): Promise<InfoSessionStateResponse> {
  try {
    const raw = await postToInfoSessionRoute(INFO_SESSION_STATE_PATH, input);
    const parsed = infoSessionStateResponseSchema.safeParse(raw);
    return parsed.success ? parsed.data : { status: 'unauthorized' };
  } catch {
    return { status: 'unauthorized' };
  }
}
