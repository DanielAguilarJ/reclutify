import 'server-only';

import { z } from 'zod';

import { createAdminClient } from '@/utils/supabase/admin';

import {
  classifyInterviewTicketLifecycle,
  isInterviewTicketExpired,
  type InterviewTicketConsumeStatus,
  type InterviewTicketResponse,
  interviewTicketTopicSchema,
} from './contracts';

/**
 * Resolución y consumo del ticket de entrevista con `service_role`.
 *
 * Este módulo es el único punto del producto que lee y escribe
 * `interview_tickets` para un candidato sin cuenta. Corre en el servidor con la
 * clave de servicio, que IGNORA RLS por diseño: la autorización es el propio
 * token —quien lo presenta es el candidato al que se emitió— y la protección de
 * datos es la proyección explícita de columnas que hace `resolveInterviewTicket`.
 *
 * No hay comprobación de organización porque no hay sesión: el token ES la
 * credencial. Lo que sí hay es un límite estricto de lo que sale de la base
 * (ver `contracts.ts`) y de lo que se escribe (solo `used`).
 */

/**
 * Fila de `interview_tickets` que la resolución necesita.
 *
 * `looseObject` porque `select` pide columnas concretas pero la tabla puede
 * ganar otras; lo que importa es que estén las que se leen y con el tipo
 * correcto.
 *
 * `expires_at` es `BIGINT` y PostgREST lo entrega como número, pero se coacciona
 * por si un cliente o una configuración lo entrega como cadena. Si llegara nulo
 * la coacción da `0`, lo que clasifica el ticket como expirado: falla cerrado,
 * que es la dirección correcta para una credencial.
 */
const ticketRowSchema = z.looseObject({
  candidate_name: z.string(),
  role_id: z.string(),
  language: z.string().nullable(),
  expires_at: z.coerce.number(),
  used: z.boolean().nullable(),
});

/** Fila de `roles` proyectada al subconjunto que usa la entrevista. */
const roleRowSchema = z.looseObject({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  salary: z.string().nullable(),
  job_type: z.string().nullable(),
  interview_duration: z.number().nullable(),
  interview_mode: z.string().nullable(),
  topics: z.unknown(),
  org_id: z.string().nullable(),
});

/**
 * Columnas que se piden de cada tabla.
 *
 * Están escritas como constantes para que la proyección sea evidente en
 * revisión: `token` no aparece en la del ticket y `public_token` no aparece en
 * la del rol.
 */
const TICKET_COLUMNS = 'candidate_name, role_id, language, expires_at, used';
const ROLE_COLUMNS =
  'id, title, description, location, salary, job_type, interview_duration, interview_mode, topics, org_id';
const ORG_COLUMNS = 'plan_tier';

/** Valores por defecto que la página aplicaba cuando la columna venía vacía. */
const DEFAULT_INTERVIEW_DURATION_MINUTES = 30;
const DEFAULT_INTERVIEW_MODE = 'restricted';
const DEFAULT_PLAN_TIER = 'starter';

/** Prefijo estable para filtrar en los logs los rechazos de esta ruta. */
const LOG_PREFIX = '[interview-ticket]';

/** Convierte `null` en `undefined` para que la clave desaparezca del JSON. */
function optionalText(value: string | null): string | undefined {
  return value ?? undefined;
}

/**
 * Traduce los criterios almacenados en `roles.topics` (JSONB) a `Topic[]`.
 *
 * Los criterios malformados se descartan uno a uno en lugar de invalidar el
 * puesto entero: la entrevista con un criterio menos sigue siendo una
 * entrevista, y un `roles.topics` corrupto no debe dejar al candidato fuera.
 */
function parseTopics(raw: unknown): z.infer<typeof interviewTicketTopicSchema>[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    const parsed = interviewTicketTopicSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Resuelve un token a los datos que necesita `/interview/t/[token]`.
 *
 * Devuelve el mismo `not_found` para el token inexistente, para el error de
 * consulta y para el ticket cuyo puesto ya no existe. Son los tres casos en los
 * que la página mostraba "Ticket Inválido", y unificarlos evita que la respuesta
 * confirme la existencia de un token.
 */
export async function resolveInterviewTicket(
  token: string,
  now: number = Date.now(),
): Promise<InterviewTicketResponse> {
  const admin = createAdminClient();

  const { data: ticketData, error: ticketError } = await admin
    .from('interview_tickets')
    .select(TICKET_COLUMNS)
    .eq('token', token)
    .maybeSingle();

  if (ticketError) {
    console.error(`${LOG_PREFIX} ticket lookup failed:`, ticketError.message);
    return { status: 'not_found' };
  }

  const ticketRow = ticketRowSchema.safeParse(ticketData);
  if (!ticketRow.success) return { status: 'not_found' };

  const lifecycle = classifyInterviewTicketLifecycle(
    { used: ticketRow.data.used, expiresAt: ticketRow.data.expires_at },
    now,
  );

  if (lifecycle !== 'valid') return { status: lifecycle };

  const { data: roleData, error: roleError } = await admin
    .from('roles')
    .select(ROLE_COLUMNS)
    .eq('id', ticketRow.data.role_id)
    .maybeSingle();

  if (roleError) {
    console.error(`${LOG_PREFIX} role lookup failed:`, roleError.message);
    return { status: 'not_found' };
  }

  const roleRow = roleRowSchema.safeParse(roleData);
  if (!roleRow.success) return { status: 'not_found' };

  // La marca blanca del encabezado depende del plan. Un fallo aquí no invalida
  // la entrevista: se cae al plan por defecto, que es marca blanca apagada.
  let planTier = DEFAULT_PLAN_TIER;
  if (roleRow.data.org_id) {
    const { data: orgData, error: orgError } = await admin
      .from('organizations')
      .select(ORG_COLUMNS)
      .eq('id', roleRow.data.org_id)
      .maybeSingle();

    if (orgError) {
      console.error(`${LOG_PREFIX} org lookup failed:`, orgError.message);
    }

    const orgPlanTier = z
      .looseObject({ plan_tier: z.string().nullable() })
      .safeParse(orgData);

    if (orgPlanTier.success && orgPlanTier.data.plan_tier) {
      planTier = orgPlanTier.data.plan_tier;
    }
  }

  return {
    status: 'valid',
    ticket: {
      candidateName: ticketRow.data.candidate_name,
      roleId: ticketRow.data.role_id,
      language: ticketRow.data.language === 'en' ? 'en' : 'es',
      expiresAt: ticketRow.data.expires_at,
      used: ticketRow.data.used === true,
    },
    role: {
      id: roleRow.data.id,
      title: roleRow.data.title,
      description: optionalText(roleRow.data.description),
      location: optionalText(roleRow.data.location),
      salary: optionalText(roleRow.data.salary),
      jobType: optionalText(roleRow.data.job_type),
      interviewDuration: roleRow.data.interview_duration ?? DEFAULT_INTERVIEW_DURATION_MINUTES,
      interviewMode: roleRow.data.interview_mode === 'internal' ? 'internal' : DEFAULT_INTERVIEW_MODE,
      topics: parseTopics(roleRow.data.topics),
    },
    org: { planTier },
  };
}

/**
 * Resultado de mirar un token como PRUEBA DE ACCESO, no como pase de entrada.
 *
 * `used` viene informado pero NO invalida la credencial; ver
 * `resolveInterviewTicketCredential`.
 */
export type InterviewTicketCredential =
  | { status: 'valid'; roleId: string; used: boolean }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'error' };

/**
 * Resuelve un token como prueba de que quien escribe participa en la entrevista.
 *
 * POR QUÉ NO SIRVE `resolveInterviewTicket` AQUÍ
 * ----------------------------------------------
 * Esa función responde a "¿puede esta persona ENTRAR a la entrevista?", y para
 * eso un ticket ya consumido es un `no`: el ticket es de un solo uso y se quema
 * al entrar a la sala (`/api/interview/ticket/consume`, invocado por la página
 * cuando `phase === 'interview'`).
 *
 * Esta función responde a otra pregunta: "¿es quien escribe el candidato de esta
 * entrevista?". Y ahí el ticket consumido es la situación NORMAL, no la
 * excepción: TODAS las escrituras de `candidate_results` del flujo de ticket
 * ocurren después de entrar a la sala — la sincronización de la transcripción
 * durante la entrevista, el `status: 'completed'` con la evaluación al terminar y
 * los reintentos de la cola. Exigir `used = false` dejaría a cada candidato del
 * flujo de ticket sin poder guardar su propia entrevista, que es exactamente el
 * fallo que este endurecimiento no puede provocar.
 *
 * La comprobación correcta es, por tanto: el token EXISTE y NO ha vencido. La
 * vigencia sí se exige, porque un token vencido ya no acredita nada; la regla es
 * la misma que aplica el pase de entrada (`isInterviewTicketExpired`).
 *
 * Lo que la credencial acredita es acotado, y ahí está su seguridad: solo
 * autoriza a escribir filas del `role_id` de ESE ticket, y la ruta limita además
 * las columnas. No sustituye a la comprobación de pertenencia de la fila.
 */
export async function resolveInterviewTicketCredential(
  token: string,
  now: number = Date.now(),
): Promise<InterviewTicketCredential> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('interview_tickets')
    .select('role_id, expires_at, used')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} credential lookup failed:`, error.message);
    return { status: 'error' };
  }

  const ticketRow = z
    .looseObject({
      role_id: z.string(),
      expires_at: z.coerce.number(),
      used: z.boolean().nullable(),
    })
    .safeParse(data);

  // Token inexistente y fila ilegible comparten respuesta: en los dos casos no
  // hay credencial que valga, y distinguirlos convertiría la ruta en un
  // confirmador de tokens.
  if (!ticketRow.success) return { status: 'not_found' };

  if (isInterviewTicketExpired(ticketRow.data.expires_at, now)) {
    return { status: 'expired' };
  }

  return {
    status: 'valid',
    roleId: ticketRow.data.role_id,
    used: ticketRow.data.used === true,
  };
}

/** Resultado del consumo. `error` es el único caso que produce un 5xx. */
export type InterviewTicketConsumeResult =
  | { status: InterviewTicketConsumeStatus }
  | { status: 'error' };

/**
 * Marca `used = true` para un token, y solo si el ticket puede consumirse.
 *
 * La comprobación previa distingue los tres rechazos; el `UPDATE` lleva además
 * el filtro `used IS NOT TRUE` para que dos peticiones simultáneas no puedan
 * consumir el mismo ticket dos veces. Si el filtro no alcanza ninguna fila es
 * que otra petición ganó la carrera, así que el estado devuelto es `used`.
 *
 * `IS NOT TRUE` en lugar de `= false` porque `used` admite nulos en el esquema
 * (`BOOLEAN DEFAULT false`) y una fila heredada con `NULL` debe poder
 * consumirse.
 */
export async function consumeInterviewTicket(
  token: string,
  now: number = Date.now(),
): Promise<InterviewTicketConsumeResult> {
  const admin = createAdminClient();

  const { data: ticketData, error: ticketError } = await admin
    .from('interview_tickets')
    .select('expires_at, used')
    .eq('token', token)
    .maybeSingle();

  if (ticketError) {
    console.error(`${LOG_PREFIX} consume lookup failed:`, ticketError.message);
    return { status: 'not_found' };
  }

  const ticketRow = z
    .looseObject({ expires_at: z.coerce.number(), used: z.boolean().nullable() })
    .safeParse(ticketData);

  if (!ticketRow.success) return { status: 'not_found' };

  const lifecycle = classifyInterviewTicketLifecycle(
    { used: ticketRow.data.used, expiresAt: ticketRow.data.expires_at },
    now,
  );

  if (lifecycle !== 'valid') return { status: lifecycle };

  const { data: updated, error: updateError } = await admin
    .from('interview_tickets')
    .update({ used: true })
    .eq('token', token)
    .not('used', 'is', true)
    .select('role_id');

  if (updateError) {
    console.error(`${LOG_PREFIX} consume update failed:`, updateError.message);
    return { status: 'error' };
  }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { status: 'used' };
  }

  return { status: 'consumed' };
}
