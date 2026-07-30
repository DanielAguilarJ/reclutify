import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

/**
 * Manejo uniforme de errores para TODOS los route handlers.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * Antes cada ruta improvisaba su propio `catch`. El resultado era una API con
 * tres comportamientos distintos ante el mismo fallo:
 *
 *  - `/api/tts` devolvía `{ error: err.message }` con status 500 — es decir,
 *    filtraba al cliente el mensaje interno de la excepción, que en un fallo de
 *    `fetch` incluye la URL y el host del proveedor.
 *  - `/api/test-integration` devolvía `Error interno: ${error.message}`, mismo
 *    problema.
 *  - `/api/chat` devolvía `'Internal server error'` sin más, que es lo correcto,
 *    pero sin registrar contexto suficiente para reproducir.
 *
 * Aquí la regla es una sola: **el cliente recibe un mensaje que nosotros
 * elegimos; el detalle técnico va al log del servidor y no sale de ahí.**
 *
 * RELACIÓN CON `src/lib/training/http.ts`
 * ---------------------------------------
 * `trainingApiErrorResponse` hace lo mismo para el centro de capacitación y
 * además traduce los errores de sus RPC de Postgres. No se toca: sigue siendo la
 * puerta de las rutas de `training/*`. Este módulo es la puerta del resto, y
 * ambos coinciden en la forma de la respuesta (`{ error: string }`) para que el
 * cliente no tenga que distinguir de dónde vino el fallo.
 *
 * FORMA DE LA RESPUESTA
 * ---------------------
 * `{ error: string, code?: string, details?: unknown }`.
 *
 * `error` se mantiene como única clave obligatoria porque es la que ya leen
 * todos los clientes actuales del repo (`InterviewRoom`, `adminStore`,
 * `TutorPanel`, etc. hacen `data.error`). Añadir claves es compatible; quitar
 * `error` no lo sería.
 */

/** Códigos estables que el cliente puede discriminar sin parsear el mensaje. */
export const API_ERROR_CODES = {
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  VALIDATION_FAILED: 'validation_failed',
  RATE_LIMITED: 'rate_limited',
  UPSTREAM_FAILED: 'upstream_failed',
  UPSTREAM_TIMEOUT: 'upstream_timeout',
  MISCONFIGURED: 'misconfigured',
  INTERNAL: 'internal',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * Fallo con un status HTTP ya decidido y un mensaje pensado para el cliente.
 *
 * El `message` VIAJA al cliente, así que nunca debe contener detalle interno
 * (nombres de tabla, URLs de proveedores, trazas). Lo que hay que registrar va
 * en `cause`, que se queda en el log.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: ApiErrorCode = API_ERROR_CODES.INTERNAL,
    /** Detalle para el log del servidor. Nunca se serializa al cliente. */
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message, API_ERROR_CODES.UNAUTHORIZED);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message, API_ERROR_CODES.FORBIDDEN);
  }

  static notFound(message = 'Not found'): ApiError {
    return new ApiError(404, message, API_ERROR_CODES.NOT_FOUND);
  }

  static badRequest(message: string, cause?: unknown): ApiError {
    return new ApiError(400, message, API_ERROR_CODES.VALIDATION_FAILED, cause);
  }

  static misconfigured(message: string, cause?: unknown): ApiError {
    return new ApiError(500, message, API_ERROR_CODES.MISCONFIGURED, cause);
  }

  static upstream(message = 'Upstream service unavailable', cause?: unknown): ApiError {
    return new ApiError(502, message, API_ERROR_CODES.UPSTREAM_FAILED, cause);
  }

  static upstreamTimeout(message = 'Upstream service timed out', cause?: unknown): ApiError {
    return new ApiError(504, message, API_ERROR_CODES.UPSTREAM_TIMEOUT, cause);
  }
}

/** Cuerpo de error que se serializa al cliente. */
export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
  /** Solo presente en fallos de validación: qué campo falló y por qué. */
  details?: { path: string; message: string }[];
}

/**
 * Aplana un `ZodError` a una lista de `{ path, message }`.
 *
 * Se devuelve al cliente a propósito: saber que `text` excede el máximo o que
 * falta `roleId` no filtra nada —el esquema lo escribimos nosotros y el cliente
 * legítimo ya lo conoce— y sin ese detalle un 400 es indepurable desde el
 * navegador. Lo que NO se devuelve es el valor recibido, que puede contener
 * datos del candidato.
 */
export function formatZodIssues(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Convierte cualquier excepción capturada en la respuesta de error de la ruta.
 *
 * Orden de reconocimiento, de lo más explícito a lo más genérico:
 *
 *  1. `ApiError` — la ruta (o un helper) ya decidió status y mensaje.
 *  2. `ZodError` — validación fallida: `400` con el detalle de los campos.
 *  3. `AbortError` — el `fetch` a un proveedor se pasó de tiempo: `504`.
 *  4. Cualquier otra cosa — `500` con mensaje genérico.
 *
 * En los cuatro casos se registra el error completo con `context` por delante,
 * de forma que un `grep` del prefijo aísle los fallos de una ruta concreta.
 *
 * @param error Excepción capturada.
 * @param context Prefijo del log, por convención `'[nombre-de-la-ruta]'`.
 * @returns Respuesta JSON lista para devolver desde el route handler.
 */
export function handleApiError(error: unknown, context: string): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    // El nivel depende de quién tiene la culpa: un 4xx es un cliente que pidió
    // mal (información, no incidencia) y un 5xx es nuestro (incidencia).
    const log = error.status >= 500 ? console.error : console.warn;
    log(`${context} ${error.status} ${error.code}: ${error.message}`, error.cause ?? '');

    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    const details = formatZodIssues(error);
    console.warn(`${context} 400 validation_failed:`, details);

    return NextResponse.json(
      { error: 'Invalid request payload', code: API_ERROR_CODES.VALIDATION_FAILED, details },
      { status: 400 },
    );
  }

  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    console.error(`${context} 504 upstream_timeout:`, error.message);

    return NextResponse.json(
      { error: 'The request took too long. Please try again.', code: API_ERROR_CODES.UPSTREAM_TIMEOUT },
      { status: 504 },
    );
  }

  console.error(`${context} 500 internal:`, error);

  return NextResponse.json(
    { error: 'Internal server error', code: API_ERROR_CODES.INTERNAL },
    { status: 500 },
  );
}
