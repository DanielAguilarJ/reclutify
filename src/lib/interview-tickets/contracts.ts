import { z } from 'zod';

/**
 * Contrato de las dos rutas de servidor del ticket de entrevista:
 * `POST /api/interview/ticket` y `POST /api/interview/ticket/consume`.
 *
 * POR QUÉ EXISTEN ESAS RUTAS
 * --------------------------
 * Hasta ahora `/interview/t/[token]` resolvía el ticket desde el navegador con
 * la CLAVE ANON: leía `interview_tickets` por token, luego `roles`, luego
 * `organizations`, y marcaba `used = true` con un `UPDATE` directo. Para que
 * eso funcionara, `interview_tickets` tenía dos políticas abiertas
 * (`public_ticket_by_token`: `SELECT TO anon USING (true)`, y
 * `anon_tickets_update`: `UPDATE TO anon USING (true)`). Como la clave anon
 * viaja al navegador, esas políticas son públicas: cualquiera podía listar
 * todos los tickets del sistema con su `token` y su `candidate_name` —es decir,
 * abrir la entrevista de cualquier candidato— y marcar como usados los tickets
 * ajenos para dejar a terceros fuera.
 *
 * Con la resolución en el servidor, la clave anon deja de necesitar acceso a la
 * tabla y esas políticas se pueden retirar.
 *
 * POR QUÉ EL TOKEN VA EN EL CUERPO Y NO EN LA URL
 * -----------------------------------------------
 * El token es la credencial de acceso a la entrevista. Un token en la ruta o en
 * la cadena de consulta queda registrado en los logs de acceso del proxy y del
 * servidor, en el historial del navegador y en la cabecera `Referer` de
 * cualquier recurso externo que la página cargue después. En el cuerpo de un
 * `POST` no aparece en ninguno de esos sitios, y por eso ambas rutas son `POST`
 * aunque la primera sea conceptualmente una lectura.
 *
 * QUÉ SE DEVUELVE Y QUÉ NO
 * ------------------------
 * Solo lo que la pantalla del candidato usa. En particular NUNCA salen:
 *
 *  - `interview_tickets.token` (el candidato ya lo tiene; devolverlo solo añade
 *    una copia más en caché y en logs),
 *  - `roles.public_token`, que es la credencial del enlace general de la
 *    vacante: filtrarla convertiría esta ruta en un oráculo de enlaces
 *    públicos,
 *  - cualquier columna de `organizations` distinta de `plan_tier`. Esa tabla
 *    contiene `stripe_customer_id`, `stripe_subscription_id`,
 *    `subscription_status`, `billing_interval` y `max_interviews_per_month`.
 *
 * Este módulo es isomorfo a propósito: lo importan la ruta de servidor (para
 * construir la respuesta) y la página del candidato (para validarla), así que
 * no puede depender de `server-only`.
 */

/**
 * Tope de longitud del token aceptado.
 *
 * Los tokens que emite la plataforma tienen 16 caracteres
 * (`INVITE_TOKEN_LENGTH`), y los heredados 8. El tope es holgado para no
 * rechazar formatos antiguos, pero acotado para no pasar cadenas arbitrariamente
 * largas a la base de datos.
 */
export const MAX_INTERVIEW_TICKET_TOKEN_LENGTH = 128;

/** Cuerpo de las dos rutas: únicamente el token. */
export const interviewTicketRequestSchema = z.strictObject({
  token: z.string().trim().min(1).max(MAX_INTERVIEW_TICKET_TOKEN_LENGTH),
});

export type InterviewTicketRequest = z.infer<typeof interviewTicketRequestSchema>;

/**
 * Los cuatro estados que la pantalla del candidato ya distinguía cuando
 * resolvía el ticket por su cuenta, y que la ruta reproduce tal cual.
 *
 * `not_found` cubre el token inexistente Y cualquier fallo de resolución
 * (error de consulta, rol borrado): la pantalla que el candidato veía en todos
 * esos casos era la misma —"Ticket Inválido"—, y devolver un estado distinto
 * para "existe pero algo falló" convertiría la ruta en un confirmador de
 * tokens.
 */
export const INTERVIEW_TICKET_STATUSES = ['valid', 'not_found', 'used', 'expired'] as const;

export type InterviewTicketStatus = (typeof INTERVIEW_TICKET_STATUSES)[number];

/** Estados de rechazo: los que no entregan datos del ticket. */
export const INTERVIEW_TICKET_REJECTED_STATUSES = ['not_found', 'used', 'expired'] as const;

export type InterviewTicketRejectedStatus =
  (typeof INTERVIEW_TICKET_REJECTED_STATUSES)[number];

/**
 * Código HTTP por estado de rechazo.
 *
 * Cada caso tiene el suyo para que sea distinguible en los logs del servidor y
 * en las sondas, pero el cuerpo nunca añade detalle sobre el token: `404` es la
 * respuesta tanto de "no existe" como de "no se pudo resolver".
 */
export const INTERVIEW_TICKET_STATUS_CODES: Record<InterviewTicketRejectedStatus, number> = {
  not_found: 404,
  used: 409,
  expired: 410,
};

/**
 * Rúbrica de un criterio de evaluación.
 *
 * `looseObject` porque la rúbrica la genera un modelo y puede traer campos
 * añadidos con el tiempo; descartarlos aquí no aporta nada y romper la
 * entrevista por un campo extra sí quita.
 */
const interviewTicketTopicRubricSchema = z.looseObject({
  excellent: z.string(),
  acceptable: z.string(),
  poor: z.string(),
  weight: z.number(),
});

/**
 * Criterio de evaluación del puesto (`Topic` en `src/types`).
 *
 * La rúbrica lleva `.catch(undefined)`: una rúbrica malformada degrada ese
 * criterio a "sin rúbrica" en lugar de tirar el criterio entero, que es lo que
 * la entrevista necesita para seguir cubriendo el tema.
 */
export const interviewTicketTopicSchema = z.looseObject({
  id: z.string(),
  label: z.string(),
  score: z.number().optional(),
  rubric: interviewTicketTopicRubricSchema.optional().catch(undefined),
});

/**
 * Datos del puesto que la entrevista necesita.
 *
 * Es exactamente el subconjunto que la página leía de `roles` con la clave
 * anon. `public_token`, `org_id`, `is_published` y `published_at` quedan fuera.
 */
export const interviewTicketRoleSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  salary: z.string().optional(),
  jobType: z.string().optional(),
  interviewDuration: z.number(),
  interviewMode: z.enum(['restricted', 'internal']),
  topics: z.array(interviewTicketTopicSchema),
});

/**
 * Datos del ticket que la pantalla usa: el idioma de la entrevista, el nombre
 * con el que se precarga el formulario y el puesto al que apunta.
 *
 * `used` viene siempre `false` aquí (si fuera `true` el estado sería `used`) y
 * `expiresAt` es informativo: la vigencia ya la decidió el servidor.
 */
export const interviewTicketDataSchema = z.strictObject({
  candidateName: z.string(),
  roleId: z.string(),
  language: z.enum(['en', 'es']),
  expiresAt: z.number(),
  used: z.boolean(),
});

/**
 * Único dato de la organización que sale: el plan, que gobierna la marca
 * blanca del encabezado (`plan_tier === 'enterprise'`).
 */
export const interviewTicketOrgSchema = z.strictObject({
  planTier: z.string(),
});

/** Respuesta del caso válido. */
export const resolvedInterviewTicketSchema = z.strictObject({
  status: z.literal('valid'),
  ticket: interviewTicketDataSchema,
  role: interviewTicketRoleSchema,
  org: interviewTicketOrgSchema,
});

/** Respuesta de los tres casos de rechazo: solo el estado, sin datos. */
export const rejectedInterviewTicketSchema = z.strictObject({
  status: z.enum(INTERVIEW_TICKET_REJECTED_STATUSES),
});

export const interviewTicketResponseSchema = z.union([
  resolvedInterviewTicketSchema,
  rejectedInterviewTicketSchema,
]);

export type ResolvedInterviewTicket = z.infer<typeof resolvedInterviewTicketSchema>;
export type InterviewTicketResponse = z.infer<typeof interviewTicketResponseSchema>;

/**
 * Estados de la ruta de consumo.
 *
 * `consumed` es el único éxito. Un ticket ya usado o expirado se rechaza SIN
 * escribir: el consumo no es un "asegúrate de que está usado", es la transición
 * de disponible a usado, y solo puede ocurrir una vez.
 */
export const INTERVIEW_TICKET_CONSUME_STATUSES = [
  'consumed',
  'not_found',
  'used',
  'expired',
] as const;

export type InterviewTicketConsumeStatus =
  (typeof INTERVIEW_TICKET_CONSUME_STATUSES)[number];

export const interviewTicketConsumeResponseSchema = z.strictObject({
  status: z.enum(INTERVIEW_TICKET_CONSUME_STATUSES),
});

export type InterviewTicketConsumeResponse = z.infer<
  typeof interviewTicketConsumeResponseSchema
>;

/** Vigencia y estado de consumo de una fila de `interview_tickets`. */
export interface InterviewTicketLifecycleInput {
  used: boolean | null;
  expiresAt: number;
}

/**
 * Decide si un ticket está disponible, ya usado o expirado.
 *
 * El orden importa y reproduce el que aplicaba la página: primero `used`,
 * después la caducidad. Un ticket usado Y expirado se reporta como `used`,
 * igual que antes.
 */
export function classifyInterviewTicketLifecycle(
  ticket: InterviewTicketLifecycleInput,
  now: number,
): 'valid' | 'used' | 'expired' {
  if (ticket.used === true) return 'used';
  if (now > ticket.expiresAt) return 'expired';
  return 'valid';
}
