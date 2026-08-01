import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { classifySupabaseKeyShape } from '@/lib/supabase-key';

/**
 * Registro de telemetría de los turnos de entrevista.
 *
 * QUÉ SE CONSERVA DE LA VERSIÓN ANTERIOR
 * --------------------------------------
 * La política de la clave: se EXIGE la clave de servicio y no hay respaldo a la
 * clave anon. El razonamiento original sigue valiendo y está resumido aquí porque
 * es la razón de que exista este módulo en vez de un `insert` suelto:
 *
 *   El respaldo `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *   parecía inocuo, pero para que funcionara `interview_telemetry` necesitaba una
 *   política de inserción abierta (`WITH CHECK (true)`), y la clave anon viaja al
 *   navegador. Es decir: cualquier visitante podía inyectar filas de telemetría
 *   con el contenido que quisiera. Sin el respaldo, esa política se pudo retirar
 *   (`202608010006_drop_permissive_insert_policies.sql`).
 *
 * También se conserva que **la telemetría nunca tumba una entrevista**: si falta
 * la configuración o la inserción falla, se avisa una vez y se sigue. Es material
 * de depuración, no parte del producto.
 *
 * QUÉ CAMBIA
 * ----------
 * 1. **`raw_payload` ya no guarda el cuerpo entero.** La versión anterior hacía
 *    `raw_payload: { ...rawBody, _debug }`, y `rawBody` incluye `cvData`: nombre,
 *    correo, teléfono e historial laboral completo del candidato, más
 *    `recentMessages`, que es la transcripción. Todo eso quedaba en una tabla que
 *    hasta esta misma ronda era legible por CUALQUIER cuenta autenticada
 *    (ver `202608020002`). Ahora se guarda un resumen estructurado del turno y
 *    los datos personales se sustituyen por indicadores de presencia.
 *
 * 2. **La promesa ya no queda flotando.** Antes se llamaba `logTelemetry(...)`
 *    sin `await` y sin `.catch()`. En un entorno serverless la respuesta se
 *    devuelve y la instancia puede congelarse antes de que la inserción llegue a
 *    la base: la telemetría se perdía justo en los turnos que más interesa
 *    depurar, los lentos. Ahora el llamante decide con `waitUntil` o `await`.
 *
 * 3. **El modelo se pasa como dato.** Antes el identificador estaba escrito a
 *    mano en las cinco llamadas de registro del archivo, así que un cambio de
 *    modelo dejaba la telemetría mintiendo sobre qué modelo generó cada turno.
 */

/** Aviso emitido una sola vez por proceso. */
let telemetryDisabledWarningIssued = false;

/**
 * Avisa UNA vez de que la telemetría está desactivada.
 *
 * El motivo es de configuración del entorno, no de la petición: repetirlo en cada
 * turno de cada entrevista solo llenaría el log y esconderÍa lo demás.
 *
 * El mensaje nombra la variable, jamás su valor. La aparición literal de
 * `service_role` se refiere a la fila del panel de Supabase, no al secreto.
 */
function warnTelemetryDisabledOnce(reason: string): void {
  if (telemetryDisabledWarningIssued) return;
  telemetryDisabledWarningIssued = true;
  console.warn(
    `[Telemetry] Registro de interview_telemetry desactivado: ${reason} La entrevista continúa con normalidad.`,
  );
}

/** Solo para pruebas: permite volver a comprobar el aviso. */
export function __resetTelemetryWarning(): void {
  telemetryDisabledWarningIssued = false;
}

/**
 * Cliente de telemetría, o `null` si no hay configuración utilizable.
 *
 * El `import` dinámico de `@supabase/supabase-js` se mantiene para no cargar la
 * librería en el arranque en frío de la ruta: en el camino feliz la telemetría es
 * lo último que importa y la respuesta al candidato es lo primero.
 */
export async function createTelemetryClient(): Promise<SupabaseClient | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  // El recorte importa: un salto de línea arrastrado en el copiado convertiría
  // una clave por lo demás correcta en una cabecera HTTP inválida.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

  if (supabaseUrl.length === 0) {
    warnTelemetryDisabledOnce('falta NEXT_PUBLIC_SUPABASE_URL.');
    return null;
  }

  const keyShape = classifySupabaseKeyShape(serviceRoleKey);

  if (keyShape !== 'service-role') {
    warnTelemetryDisabledOnce(
      keyShape === 'missing'
        ? 'falta SUPABASE_SERVICE_ROLE_KEY y no se usa NEXT_PUBLIC_SUPABASE_ANON_KEY como alternativa.'
        : keyShape === 'anon'
          ? 'SUPABASE_SERVICE_ROLE_KEY contiene la clave anon (publicable) del proyecto, que no puede saltarse RLS.'
          : 'SUPABASE_SERVICE_ROLE_KEY no tiene la forma de una clave de servicio; probablemente sea el nombre de la fila o un marcador de posición.',
    );
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/** Un turno a registrar. */
export interface TelemetryTurn {
  sessionId: string;
  /**
   * Organización dueña del turno. Es lo que permite que `/admin/telemetry` enseñe lo suyo y solo
   * lo suyo.
   *
   * La tabla no tenía por dónde filtrar —`session_id` y `role_title` son texto libre— así que al
   * cerrar la política de lectura que permitía a cualquier cuenta leer todas las organizaciones,
   * el panel se quedó sin datos. Quien escribe es `/api/chat`, que ya autorizó la petición y por
   * tanto conoce la organización.
   */
  orgId: string | null;
  candidateName: string | null;
  roleTitle: string | null;
  turnIndex: number;
  model: string;
  promptText?: string;
  responseText?: string;
  reasoningText?: string | null;
  errorText?: string;
  durationMs?: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    reasoning_tokens?: number;
  };
  /** Estado del motor de tiempos y de la fase. Sin datos personales. */
  debugState?: Record<string, unknown>;
}

/**
 * Registra un turno. **No lanza nunca.**
 *
 * Devuelve `true` si la fila se insertó, para que las pruebas puedan afirmarlo
 * sin inspeccionar el log.
 */
export async function logInterviewTurn(turn: TelemetryTurn): Promise<boolean> {
  if (!turn.sessionId) return false;

  try {
    const supabase = await createTelemetryClient();
    if (!supabase) return false;

    const { error } = await supabase.from('interview_telemetry').insert({
      session_id: turn.sessionId,
      org_id: turn.orgId,
      candidate_name: turn.candidateName,
      role_title: turn.roleTitle,
      turn_index: turn.turnIndex,
      model: turn.model,
      prompt_tokens: turn.usage?.prompt_tokens ?? 0,
      completion_tokens: turn.usage?.completion_tokens ?? 0,
      total_tokens: turn.usage?.total_tokens ?? 0,
      reasoning_tokens: turn.usage?.reasoning_tokens ?? 0,
      reasoning_text: turn.reasoningText ?? null,
      prompt_text: turn.promptText ?? null,
      response_text: turn.responseText ?? null,
      error_text: turn.errorText ?? null,
      duration_ms: turn.durationMs ?? 0,
      raw_payload: turn.debugState ?? {},
    });

    if (error) {
      console.error('[Telemetry] Insert failed:', error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Telemetry] Failed to log:', error);
    return false;
  }
}

/**
 * Resumen del cuerpo de la petición SIN datos personales.
 *
 * Sustituye al `{ ...rawBody }` anterior. Guarda lo que sirve para reproducir un
 * problema —cuántos mensajes había, si venía CV, qué tamaño tenía el prompt— y
 * no lo que identifica a una persona.
 *
 * `cvData` se reduce a indicadores de presencia: para depurar «¿por qué Zara no
 * preguntó por el CV?» basta saber que el CV llegó y con cuántas entradas, no el
 * historial laboral de nadie.
 */
export function summarizeChatPayload(input: {
  roleId: string;
  currentTopic: string;
  currentTopicIndex: number;
  topicCount: number;
  messageCount: number;
  interviewMode: string;
  language: string;
  interviewDuration: number;
  timerSeconds: number;
  hasCv: boolean;
  cvExperienceCount: number;
  cvSkillCount: number;
  promptChars: number;
}): Record<string, unknown> {
  return {
    roleId: input.roleId,
    currentTopic: input.currentTopic,
    currentTopicIndex: input.currentTopicIndex,
    topicCount: input.topicCount,
    messageCount: input.messageCount,
    interviewMode: input.interviewMode,
    language: input.language,
    interviewDuration: input.interviewDuration,
    timerSeconds: input.timerSeconds,
    cv: {
      present: input.hasCv,
      experienceEntries: input.cvExperienceCount,
      skills: input.cvSkillCount,
    },
    promptChars: input.promptChars,
    // Marca explícita para que quien lea la tabla sepa que ya no hay cuerpo crudo
    // y no busque campos que no van a estar.
    _redacted: 'cvData y recentMessages se omiten a proposito: contienen datos personales del candidato.',
  };
}
