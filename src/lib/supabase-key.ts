/**
 * Validación de FORMA de las claves de API de Supabase.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * `createAdminClient()` solo comprobaba la presencia de
 * `SUPABASE_SERVICE_ROLE_KEY`. Con el literal `service_role` como valor —el
 * NOMBRE de la fila del panel de Supabase en vez de su VALOR— el cliente se
 * construía sin quejarse y cada operación posterior recibía
 * `401 Invalid API key` en tiempo de ejecución. El síntoma llegaba al usuario
 * disfrazado de bug de la aplicación, a decenas de líneas del error real.
 *
 * El caso más peligroso no es ese, sino pegar la clave `anon`: es un JWT
 * legítimo y bien formado, así que cualquier validación laxa ("¿tiene tres
 * segmentos?") lo aceptaría. Pasaría la validación y luego fallaría de forma
 * intermitente y confusa: las consultas que RLS permite funcionan, las que
 * necesitan saltarse RLS devuelven cero filas o niegan el permiso. Por eso se
 * inspecciona el `role` del payload y ese caso tiene mensaje propio.
 *
 * ALCANCE: SOLO FORMA
 * -------------------
 * No hay red, no se verifica la firma, no se comprueba `exp` ni el proyecto al
 * que pertenece la clave. Esto responde "¿me pasaron algo con la forma de una
 * clave de servicio?", no "¿esta clave es válida?". La segunda pregunta solo la
 * contesta Supabase, y la contesta con un 401 en la primera llamada real.
 *
 * REGLA CRÍTICA: EL VALOR NUNCA SE FILTRA
 * ---------------------------------------
 * Ni las funciones de este archivo ni sus llamantes deben incluir el valor
 * inspeccionado —ni fragmentos, ni longitudes, ni prefijos, ni el payload
 * decodificado— en mensajes de error, excepciones o logs. Un secreto en un log
 * es un secreto comprometido, y las longitudes y prefijos son material de
 * reconocimiento. Por eso este módulo devuelve una etiqueta de una enumeración
 * cerrada y nunca lanza: es el llamante quien redacta el mensaje, y solo puede
 * redactarlo a partir de esa etiqueta.
 */

/**
 * Resultado de clasificar un candidato a clave de servicio.
 *
 * - `service-role`: JWT heredado con `role: "service_role"`, o clave secreta
 *   nueva con prefijo `sb_secret_`.
 * - `anon`: la clave pública del proyecto (JWT con `role: "anon"` o clave
 *   `sb_publishable_`). Tiene su propia etiqueta porque el mensaje debe explicar
 *   que esa clave no puede saltarse RLS, no que "no parece una clave".
 * - `missing`: ausente, no textual, o solo espacios.
 * - `unrecognized`: cualquier otra cosa, incluido el literal `service_role`.
 */
export type SupabaseKeyShape = 'service-role' | 'anon' | 'missing' | 'unrecognized';

/** Alfabeto de base64url: sin `+`, sin `/`, sin relleno `=`. */
const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/;

/** Prefijo de las claves secretas del formato nuevo de Supabase. */
const SECRET_KEY_PREFIX = 'sb_secret_';

/** Prefijo de las claves publicables (equivalente moderno de `anon`). */
const PUBLISHABLE_KEY_PREFIX = 'sb_publishable_';

/**
 * Material mínimo exigido tras el prefijo de una clave con formato nuevo.
 *
 * Las claves reales traen bastante más, así que el umbral es deliberadamente
 * bajo: solo separa una clave de un marcador de posición del tipo
 * `sb_secret_TODO` o `sb_secret_`, que es el error que se pretende atrapar. No
 * se ajusta a la longitud exacta observada hoy porque el formato es reciente y
 * podría cambiar; rechazar una clave legítima sería peor que aceptar una
 * cadena larga inservible, que de todos modos morirá en el primer 401.
 */
const MIN_SECRET_KEY_MATERIAL = 20;

/**
 * Decodifica un segmento base64url a texto, o devuelve `null` si no se puede.
 *
 * Nunca lanza: base64url mal formado, bytes que no son UTF-8 válido o la
 * ausencia de `Buffer` en el entorno son todos "no se pudo decodificar". El
 * llamante trata ese `null` como "no es una clave", que es la respuesta segura.
 */
function decodeBase64UrlSegment(segment: string): string | null {
  if (!BASE64URL_SEGMENT.test(segment)) return null;

  try {
    return Buffer.from(segment, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Extrae el `role` del payload de un JWT, o `null` si no hay uno legible.
 *
 * Devuelve `null` —sin lanzar— cuando el JWT no tiene tres segmentos, cuando el
 * payload no decodifica, cuando no es JSON válido, cuando el JSON no es un
 * objeto (un `"texto"` o un `[1,2]` son JSON perfectamente válidos) o cuando
 * `role` no es una cadena.
 */
function extractJwtRole(candidate: string): string | null {
  const segments = candidate.split('.');
  if (segments.length !== 3) return null;
  if (segments.some((segment) => segment.length === 0)) return null;

  const payloadJson = decodeBase64UrlSegment(segments[1]);
  if (payloadJson === null) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return null;
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const role = (payload as Record<string, unknown>).role;
  return typeof role === 'string' ? role : null;
}

/**
 * Clasifica un candidato a clave de servicio por su forma.
 *
 * No lanza para ninguna entrada, incluido `undefined`, objetos y cadenas
 * basura: cualquier problema se traduce a `missing` o `unrecognized`.
 */
export function classifySupabaseKeyShape(value: unknown): SupabaseKeyShape {
  if (typeof value !== 'string') return 'missing';

  const candidate = value.trim();
  if (candidate.length === 0) return 'missing';

  if (candidate.startsWith(SECRET_KEY_PREFIX)) {
    const material = candidate.slice(SECRET_KEY_PREFIX.length);
    return material.length >= MIN_SECRET_KEY_MATERIAL ? 'service-role' : 'unrecognized';
  }

  if (candidate.startsWith(PUBLISHABLE_KEY_PREFIX)) {
    return 'anon';
  }

  const role = extractJwtRole(candidate);
  if (role === 'service_role') return 'service-role';
  if (role === 'anon') return 'anon';

  // Aquí caen el literal `service_role`, los JWT con cualquier otro `role`
  // (`authenticated`, por ejemplo) y todo lo demás.
  return 'unrecognized';
}

/**
 * `true` solo si el valor tiene la forma de una clave capaz de saltarse RLS.
 *
 * La clave `anon`, el literal `service_role`, la cadena vacía y cualquier valor
 * no textual devuelven `false`. Para redactar un mensaje que distinga esos
 * casos, usar `classifySupabaseKeyShape`.
 */
export function isServiceRoleKeyShape(value: unknown): boolean {
  return classifySupabaseKeyShape(value) === 'service-role';
}
