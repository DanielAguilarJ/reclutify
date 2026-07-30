import 'server-only';

import { ApiError } from './errors';

/**
 * Cliente tipado de OpenRouter.
 *
 * POR QUÉ EXISTE
 * --------------
 * Ocho rutas hablaban con OpenRouter, y cada una lo hacía a su manera. El patrón
 * repetido en todas era:
 *
 *     const data = await response.json();
 *     const content = data.choices?.[0]?.message?.content || '';
 *
 * `response.json()` devuelve `any`, así que `data.choices[0].message.content` no
 * lo comprueba nadie: ni el compilador (es `any`) ni el código (encadena `?.` y
 * cae a `''`). El resultado es que un cambio de forma en la respuesta del
 * proveedor no da un error, da una cadena vacía que atraviesa la ruta y llega al
 * candidato como un turno de entrevista en blanco.
 *
 * Las diferencias entre las ocho no eran de criterio, eran accidentes:
 *
 *  - `/api/chat` ponía un tope de 20 s con `AbortController`; `/api/evaluate`,
 *    `/api/generate-rubric` y `/api/parse-resume` no ponían NINGUNO, así que una
 *    llamada colgada consumía el tiempo de ejecución completo de la función.
 *  - Ninguna propagaba `request.signal`, así que si el candidato cerraba la
 *    pestaña la llamada se pagaba entera de todas formas.
 *  - Cada una repetía las cabeceras `HTTP-Referer` y `X-Title` con literales.
 *  - El parseo del JSON de la respuesta estaba copiado con cuatro variantes
 *    distintas de expresión regular para extraer el objeto del texto.
 *
 * Este módulo es la única puerta a OpenRouter. Las rutas describen QUÉ quieren
 * pedir; el cómo (cabeceras, topes, reintentos, validación de la forma) está
 * aquí una vez.
 */

/** Punto de entrada de las respuestas de chat. */
const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Punto de entrada de la síntesis de voz. */
const OPENROUTER_SPEECH_URL = 'https://openrouter.ai/api/v1/audio/speech';

/**
 * Cabecera de atribución que pide OpenRouter.
 *
 * Se deriva de la URL configurada del despliegue en vez de estar incrustada:
 * antes había ocho literales `'https://reclutify.com'` que quedaban mal en
 * cualquier despliegue de prueba o de otro dominio.
 */
function attributionHeaders(title: string): Record<string, string> {
  return {
    'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://www.reclutify.com',
    'X-Title': title,
  };
}

/** Clave de API, validada de una vez con un mensaje accionable. */
function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw ApiError.misconfigured(
      'AI service is not configured. Set OPENROUTER_API_KEY in the deployment environment.',
    );
  }

  return apiKey;
}

// ─── Tipos de la conversación ────────────────────────────────────────────────

export type OpenRouterRole = 'system' | 'user' | 'assistant';

export interface OpenRouterMessage {
  role: OpenRouterRole;
  content: string;
}

/** Consumo de tokens que reporta el proveedor. */
export interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  reasoning_tokens?: number;
}

/**
 * Respuesta de chat ya comprobada.
 *
 * `content` es siempre `string` (posiblemente vacío) y `usage` siempre un objeto,
 * así que quien llama no vuelve a encadenar `?.` sobre `any`.
 */
export interface OpenRouterCompletion {
  content: string;
  reasoning: string | null;
  usage: OpenRouterUsage;
  model: string;
  /**
   * Extrae el primer objeto o array JSON del contenido.
   *
   * Existe porque los modelos devuelven el JSON pedido envuelto de formas
   * distintas: a secas, dentro de una valla ```json, o precedido de una frase.
   * Las cuatro variantes de esta lógica que había repetidas por las rutas se
   * unifican aquí.
   *
   * Devuelve `null` en vez de lanzar: cada ruta decide si un JSON ilegible es un
   * `502` (evaluación) o motivo para usar un valor por defecto (rúbricas).
   */
  parseJson<T>(): T | null;
}

/** Parámetros de una petición de chat. */
export interface ChatCompletionOptions {
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Pide al proveedor que garantice un objeto JSON en la respuesta. */
  jsonMode?: boolean;
  /** Tope de tiempo de ESTA llamada. Por defecto 30 s. */
  timeoutMs?: number;
  /** Valor de la cabecera `X-Title`. */
  title?: string;
  /**
   * Señal del llamante, normalmente `request.signal`.
   *
   * Se combina con el tope de tiempo interno: aborta la primera de las dos. Sin
   * esto, cerrar la pestaña a mitad de un turno no cancelaba la llamada y la
   * factura se generaba igual.
   */
  signal?: AbortSignal;
}

/**
 * Forma mínima de la respuesta del proveedor.
 *
 * Se declara para poder comprobarla con predicados en vez de castear. No se usa
 * Zod aquí a propósito: el objetivo es no rechazar respuestas por campos extra o
 * por variaciones entre modelos, solo saber si hay contenido utilizable.
 */
interface RawChatResponse {
  choices?: {
    message?: { content?: unknown; reasoning?: unknown };
    finish_reason?: unknown;
  }[];
  usage?: unknown;
  model?: unknown;
}

/** Predicado del consumo de tokens. */
function toUsage(raw: unknown): OpenRouterUsage {
  if (!raw || typeof raw !== 'object') return {};

  const source = raw as Record<string, unknown>;
  const pick = (key: string): number | undefined =>
    typeof source[key] === 'number' ? (source[key] as number) : undefined;

  return {
    prompt_tokens: pick('prompt_tokens'),
    completion_tokens: pick('completion_tokens'),
    total_tokens: pick('total_tokens'),
    reasoning_tokens: pick('reasoning_tokens'),
  };
}

/**
 * Extrae el primer objeto o array JSON de un texto.
 *
 * Prueba, en orden: el texto completo (el caso limpio), un bloque delimitado por
 * vallas de markdown, y por último el primer `{...}` o `[...]` que aparezca.
 */
function extractJson<T>(content: string): T | null {
  const candidates: string[] = [];

  const trimmed = content.trim();
  if (trimmed) candidates.push(trimmed);

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1]);

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) candidates.push(objectMatch[0]);

  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch?.[0]) candidates.push(arrayMatch[0]);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Se prueba la siguiente forma.
    }
  }

  return null;
}

/**
 * Combina la señal del llamante con un tope de tiempo propio.
 *
 * `AbortSignal.any` está disponible en el runtime de Node de Next 16; se mantiene
 * el camino manual como respaldo para no depender de la versión exacta.
 */
function withTimeout(
  timeoutMs: number,
  external?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs);

  if (!external) {
    return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
  }

  const forward = () => controller.abort(external.reason);

  if (external.aborted) {
    forward();
  } else {
    external.addEventListener('abort', forward, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external.removeEventListener('abort', forward);
    },
  };
}

/**
 * Pide una respuesta de chat a OpenRouter.
 *
 * @throws {ApiError} 500 si falta la clave; 504 si se agota el tiempo o el
 *   llamante aborta; 502 si el proveedor responde con error o con una forma
 *   inesperada.
 */
export async function chatCompletion(
  options: ChatCompletionOptions,
): Promise<OpenRouterCompletion> {
  const apiKey = requireApiKey();
  const { signal, cleanup } = withTimeout(options.timeoutMs ?? 30_000, options.signal);

  let response: Response;

  try {
    response = await fetch(OPENROUTER_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...attributionHeaders(options.title ?? 'Reclutify'),
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';

    if (aborted) {
      // Se distingue «el cliente se fue» de «el proveedor tardó demasiado»:
      // el primero no es una incidencia y no debe llenar el log de errores.
      if (options.signal?.aborted) {
        throw new ApiError(499, 'Client closed the request', 'upstream_timeout', error);
      }

      throw ApiError.upstreamTimeout(
        'The AI service took too long to respond. Please try again.',
        error,
      );
    }

    throw ApiError.upstream('Could not reach the AI service', error);
  } finally {
    cleanup();
  }

  if (!response.ok) {
    // El cuerpo del error del proveedor va al log y NUNCA al cliente: puede
    // contener detalles de la cuenta, del saldo y de la clave.
    throw ApiError.upstream('The AI service returned an error', {
      status: response.status,
      body: await response.text().catch(() => '(unreadable)'),
    });
  }

  let raw: RawChatResponse;

  try {
    raw = (await response.json()) as RawChatResponse;
  } catch (error) {
    throw ApiError.upstream('The AI service returned a malformed response', error);
  }

  const message = raw.choices?.[0]?.message;
  const content = typeof message?.content === 'string' ? message.content : '';
  const reasoning = typeof message?.reasoning === 'string' ? message.reasoning : null;

  return {
    content,
    reasoning,
    usage: toUsage(raw.usage),
    model: typeof raw.model === 'string' ? raw.model : options.model,
    parseJson<T>() {
      return extractJson<T>(content);
    },
  };
}

// ─── Síntesis de voz ─────────────────────────────────────────────────────────

export interface SpeechOptions {
  model: string;
  input: string;
  voice: string;
  /** Tope de tiempo. Por defecto 25 s, el que ya usaba `/api/tts`. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SpeechResult {
  audio: ArrayBuffer;
  contentType: string;
}

/**
 * Sintetiza voz.
 *
 * @throws {ApiError} 502 si el proveedor falla o devuelve audio vacío; 504 si se
 *   agota el tiempo.
 */
export async function speechSynthesis(options: SpeechOptions): Promise<SpeechResult> {
  const apiKey = requireApiKey();
  const { signal, cleanup } = withTimeout(options.timeoutMs ?? 25_000, options.signal);

  let response: Response;

  try {
    response = await fetch(OPENROUTER_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...attributionHeaders('Reclutify TTS'),
      },
      body: JSON.stringify({
        model: options.model,
        input: options.input,
        voice: options.voice,
        response_format: 'mp3',
      }),
      signal,
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';

    if (aborted) {
      if (options.signal?.aborted) {
        throw new ApiError(499, 'Client closed the request', 'upstream_timeout', error);
      }
      throw ApiError.upstreamTimeout('The speech service timed out', error);
    }

    throw ApiError.upstream('Could not reach the speech service', error);
  } finally {
    cleanup();
  }

  if (!response.ok) {
    throw ApiError.upstream('The speech service returned an error', {
      status: response.status,
      body: await response.text().catch(() => '(unreadable)'),
    });
  }

  const audio = await response.arrayBuffer();

  if (audio.byteLength === 0) {
    throw ApiError.upstream('The speech service returned empty audio');
  }

  return {
    audio,
    // El proveedor puede añadir parámetros al tipo (`audio/mpeg; charset=...`);
    // se queda solo el tipo para que el navegador no reciba un valor raro.
    contentType: response.headers.get('Content-Type')?.split(';')[0]?.trim() || 'audio/mpeg',
  };
}
