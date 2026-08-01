import 'server-only';

import { createHash } from 'node:crypto';

import { createAdminClient } from '@/utils/supabase/admin';

import { ApiError, API_ERROR_CODES } from './errors';

/**
 * Limitación de tasa para los endpoints que cuestan dinero.
 *
 * QUÉ PROTEGE
 * -----------
 * Las rutas que llaman a OpenRouter facturan por token. `/api/chat` manda el
 * prompt completo de la entrevista en cada turno; `/api/tts` sintetiza audio por
 * carácter; `/api/evaluate` procesa la transcripción entera. Sin tope, un bucle
 * de `curl` agota el saldo de la cuenta. Este módulo pone el tope.
 *
 * CÓMO CUENTA
 * -----------
 * Ventana fija en Postgres (`public.consume_rate_limit`, migración
 * `202608020001`). El contador vive en la base y no en el proceso porque en
 * Vercel cada petición puede caer en una instancia distinta: un contador en
 * memoria daría un tope real de «límite × número de instancias», que no está
 * acotado.
 *
 * QUÉ HACE SI LA BASE NO RESPONDE
 * -------------------------------
 * Cae a un contador en memoria del proceso (`consumeInMemory`) y avisa UNA vez.
 * Es una decisión deliberada y es un compromiso:
 *
 *  - Fallar cerrado (rechazar todo) convertiría cualquier incidencia del
 *    limitador en una caída total de las entrevistas en curso. Una entrevista
 *    interrumpida a mitad no se recupera: el candidato pierde la sesión.
 *  - Fallar abierto (permitir todo) dejaría el presupuesto sin defensa
 *    justamente durante una incidencia.
 *
 * El contador en memoria es el punto medio: sigue acotando la ráfaga por
 * instancia, que es lo que frena un bucle desde un solo origen, y no tumba la
 * entrevista. El caso que NO cubre es el ataque distribuido durante una
 * incidencia de la base, y se acepta.
 *
 * Nótese que el fallback también cubre el intervalo entre desplegar este código
 * y aplicar la migración: sin la función en la base, la aplicación funciona con
 * protección por instancia en vez de romperse.
 */

/** Resultado de consumir una unidad de cuota. */
export interface RateLimitResult {
  allowed: boolean;
  /** Peticiones restantes en la ventana actual. */
  remaining: number;
  /** Momento en que la ventana se reinicia. */
  resetAt: Date;
  limit: number;
}

/** Configuración de un tope: cuántas peticiones por cuántos segundos. */
export interface RateLimitRule {
  /** Nombre del contador. Aísla los topes entre endpoints. */
  bucket: string;
  /** Peticiones permitidas por ventana. */
  limit: number;
  /** Duración de la ventana en segundos. */
  windowSeconds: number;
}

/**
 * Topes por endpoint.
 *
 * Los números salen del uso legítimo observable en el código del cliente, con
 * margen, no de una cifra redonda:
 *
 *  - `ai-chat`: un turno de entrevista por respuesta del candidato. Una
 *    entrevista de 60 min con respuestas de 20 s son ~180 turnos, pero el
 *    reparto real lo fija `interviewTimingEngine` en 4-40 preguntas por sesión.
 *    60/min deja margen para reintentos y varias pestañas sin permitir un bucle.
 *  - `ai-tts`: `InterviewRoom` sintetiza una vez por mensaje de Zara, más
 *    reintentos. Va más alto que el chat porque el cliente reintenta al fallar
 *    el audio.
 *  - `ai-evaluate`: una vez al terminar la entrevista. `InterviewComplete`
 *    reintenta hasta 3 veces. 10/hora cubre varias entrevistas seguidas del
 *    mismo reclutador y corta el abuso en seco.
 *  - `ai-generate`: generación de rúbricas y temas desde el panel. El
 *    reclutador itera, así que el tope es holgado.
 *  - `file-parse`: subida de CV o documento. Cada llamada arrastra un fichero
 *    de hasta 15 MB y una llamada al modelo.
 *  - `email-send`: correos transaccionales. Es el tope más estricto del
 *    conjunto porque el endpoint enviaba correo desde el dominio de la empresa
 *    sin autenticación (ver `/api/send-email`).
 *  - `public-register`: alta de candidato por enlace público. Sin sesión, así
 *    que el identificador es la IP.
 *  - `webhook-dispatch`: entrega de webhooks salientes. Bajo a propósito: el
 *    endpoint hace una petición HTTP a una URL que elige el llamante.
 */
export const RATE_LIMITS = {
  AI_CHAT: { bucket: 'ai-chat', limit: 60, windowSeconds: 60 },
  AI_TTS: { bucket: 'ai-tts', limit: 120, windowSeconds: 60 },
  AI_EVALUATE: { bucket: 'ai-evaluate', limit: 10, windowSeconds: 3600 },
  AI_GENERATE: { bucket: 'ai-generate', limit: 30, windowSeconds: 600 },
  FILE_PARSE: { bucket: 'file-parse', limit: 20, windowSeconds: 600 },
  EMAIL_SEND: { bucket: 'email-send', limit: 20, windowSeconds: 3600 },
  PUBLIC_REGISTER: { bucket: 'public-register', limit: 5, windowSeconds: 3600 },
  WEBHOOK_DISPATCH: { bucket: 'webhook-dispatch', limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;

// ─── Identificador del solicitante ───────────────────────────────────────────

/**
 * Sal del hash de identificadores.
 *
 * Sin sal, un `identifier` de la tabla sería un SHA-256 de una IP, y el espacio
 * de direcciones IPv4 es lo bastante pequeño (2^32) para invertirlo por fuerza
 * bruta en minutos. Con sal deja de ser reversible sin conocerla.
 *
 * Se cae a la clave de servicio cuando no hay sal propia porque ya es un secreto
 * del servidor con la entropía necesaria y su presencia está garantizada. La
 * consecuencia de rotarla es que los contadores en vuelo se reinician, lo cual
 * es inocuo.
 */
function rateLimitSalt(): string {
  return (
    process.env.RATE_LIMIT_SALT?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    'reclutify-rate-limit'
  );
}

/**
 * Convierte un dato identificativo en una clave opaca y estable.
 *
 * La tabla `api_rate_limits` no guarda direcciones IP en claro: es material
 * operativo para acotar el gasto, no un registro de visitantes, y guardar IPs
 * sin necesidad sería recoger un dato personal que no hace falta.
 */
export function hashRateLimitIdentifier(raw: string): string {
  return createHash('sha256').update(`${rateLimitSalt()}:${raw}`).digest('hex').slice(0, 32);
}

/**
 * Extrae la IP del cliente de las cabeceras del proxy.
 *
 * Solo se usa como identificador de cuota, NUNCA para autorizar: estas
 * cabeceras las puede falsificar quien llama si no hay un proxy de confianza
 * por delante. En Vercel, `x-forwarded-for` lo escribe la plataforma y su
 * primer elemento es la IP real del cliente.
 *
 * Devuelve `'unknown'` cuando no hay ninguna cabecera utilizable, de modo que
 * todas las peticiones sin IP identificable comparten un único contador. Es
 * intencional: agrupar es más seguro que dejarlas sin tope.
 */
export function resolveClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('cf-connecting-ip')?.trim() ||
    'unknown'
  );
}

/**
 * Identificador de cuota para una petición.
 *
 * Se prefiere el `userId` cuando hay sesión: es estable, no depende de
 * cabeceras falsificables y no castiga a varios usuarios detrás de una misma
 * IP corporativa o de un CGNAT.
 */
export function rateLimitIdentifier(request: Request, userId?: string | null): string {
  return userId
    ? hashRateLimitIdentifier(`user:${userId}`)
    : hashRateLimitIdentifier(`ip:${resolveClientIp(request)}`);
}

// ─── Respaldo en memoria ─────────────────────────────────────────────────────

/** Contadores por proceso. Solo se usan si la base no responde. */
const inMemoryCounters = new Map<string, { hits: number; resetAtMs: number }>();

let inMemoryWarningIssued = false;

/**
 * Avisa UNA vez por proceso de que el limitador está degradado.
 *
 * El motivo es de infraestructura, no de la petición: repetirlo en cada turno
 * de cada entrevista llenaría el log y taparía lo demás.
 */
function warnDegradedOnce(reason: unknown): void {
  if (inMemoryWarningIssued) return;
  inMemoryWarningIssued = true;
  console.warn(
    '[rate-limit] La funcion consume_rate_limit no esta disponible; se usa el contador en memoria ' +
      '(tope por instancia, no global). Aplica la migracion 202608020001_api_rate_limits.sql. Causa:',
    reason,
  );
}

/** Contador de ventana fija en memoria. Misma semántica que la RPC. */
function consumeInMemory(rule: RateLimitRule, identifier: string): RateLimitResult {
  const windowMs = rule.windowSeconds * 1000;
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${rule.bucket}:${identifier}:${windowStart}`;

  // Purga las ventanas caducadas para que el Map no crezca sin límite en una
  // instancia de vida larga.
  if (inMemoryCounters.size > 5000) {
    for (const [existingKey, value] of inMemoryCounters) {
      if (value.resetAtMs <= now) inMemoryCounters.delete(existingKey);
    }
  }

  const resetAtMs = windowStart + windowMs;
  const entry = inMemoryCounters.get(key) ?? { hits: 0, resetAtMs };
  entry.hits += 1;
  inMemoryCounters.set(key, entry);

  return {
    allowed: entry.hits <= rule.limit,
    remaining: Math.max(0, rule.limit - entry.hits),
    resetAt: new Date(resetAtMs),
    limit: rule.limit,
  };
}

/** Solo para pruebas: vacía los contadores del proceso. */
export function __resetInMemoryRateLimits(): void {
  inMemoryCounters.clear();
  inMemoryWarningIssued = false;
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Consume una unidad de cuota y devuelve el veredicto.
 *
 * No lanza: el llamante decide qué hacer con `allowed === false`. Para el caso
 * normal —responder `429` y cortar— existe `enforceRateLimit`.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  identifier: string,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();

    const { data, error } = await admin.rpc('consume_rate_limit', {
      p_bucket: rule.bucket,
      p_identifier: identifier,
      p_limit: rule.limit,
      p_window_seconds: rule.windowSeconds,
    });

    if (error) throw error;

    // La RPC declara `RETURNS TABLE`, así que PostgREST entrega un array.
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row.allowed !== 'boolean') {
      throw new Error('consume_rate_limit returned an unexpected shape');
    }

    return {
      allowed: row.allowed,
      remaining: typeof row.remaining === 'number' ? row.remaining : 0,
      resetAt: row.reset_at ? new Date(row.reset_at) : new Date(Date.now() + rule.windowSeconds * 1000),
      limit: rule.limit,
    };
  } catch (error) {
    warnDegradedOnce(error);
    return consumeInMemory(rule, identifier);
  }
}

/** Cabeceras estándar de cuota, para que el cliente pueda espaciarse solo. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));

  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt.getTime() / 1000)),
    'Retry-After': String(retryAfterSeconds),
  };
}

/**
 * Consume cuota y LANZA `ApiError` 429 si está agotada.
 *
 * Es la forma que usan las rutas: una línea al principio del `try`, y el
 * `catch` con `handleApiError` ya convierte la excepción en la respuesta.
 *
 * @param request Petición entrante, para derivar la IP si no hay sesión.
 * @param rule Tope a aplicar (una constante de `RATE_LIMITS`).
 * @param userId Identificador del usuario autenticado, si lo hay.
 * @throws {ApiError} 429 cuando la cuota está agotada.
 */
export async function enforceRateLimit(
  request: Request,
  rule: RateLimitRule,
  userId?: string | null,
): Promise<RateLimitResult> {
  const identifier = rateLimitIdentifier(request, userId);
  const result = await consumeRateLimit(rule, identifier);

  if (!result.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000));

    throw new ApiError(
      429,
      `Too many requests. Try again in ${retryAfterSeconds} second(s).`,
      API_ERROR_CODES.RATE_LIMITED,
      { bucket: rule.bucket, limit: rule.limit, windowSeconds: rule.windowSeconds },
    );
  }

  return result;
}
