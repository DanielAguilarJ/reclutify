import 'server-only';

import { z } from 'zod';

import {
  authorizeOrgRoleAccess,
  requireOrgSession,
  resolveRoleOrganization,
} from '@/lib/authz/org-role-authorization';
import { resolveInterviewTicketCredential } from '@/lib/interview-tickets/service';
import { createAdminClient } from '@/utils/supabase/admin';

import type { CandidateResultAccessProof } from './access-proof-contracts';

/**
 * Validación en el servidor de la PRUEBA DE ACCESO de `/api/candidate-results`.
 *
 * La ruta escribe con `service_role`, que ignora RLS: si la ruta no exige una
 * credencial, no la exige nadie. Este módulo responde a las dos preguntas de la
 * autorización, en este orden y por separado:
 *
 *  1. `requireCandidateResultCredential` — ¿hay ALGUNA credencial? Se resuelve
 *     antes de tocar `candidate_results`, para que una petición anónima se vaya
 *     con `401` sin haber leído ni una fila.
 *  2. `authorizeCredentialForRole` — ¿esa credencial acredita la vacante de la
 *     fila que se quiere escribir? Devuelve el `roleId` y el `org_id` que la
 *     credencial acredita, siempre resueltos en el servidor.
 *
 * LOS TRES CAMINOS LEGÍTIMOS
 * --------------------------
 *  - `ticketToken`: el candidato de `/interview/t/[token]`. Acredita el
 *    `role_id` de SU ticket y nada más.
 *  - `publicToken`: el candidato de `/interview/public/[publicToken]`. Acredita
 *    la vacante cuyo `roles.public_token` coincide.
 *  - Sesión de `owner`/`admin` de la organización dueña de la vacante: el panel.
 *    `/admin/pipeline` también llama a `updateCandidate` (reintento manual de la
 *    evaluación) y ese camino NO tiene token de candidato; sin este tercer
 *    método, cerrar la ruta rompería el panel. La comprobación es la compartida
 *    de `src/lib/authz/org-role-authorization.ts`, la misma que usa
 *    `/api/invite-candidates`: pertenencia por `org_members` o por
 *    `user_profiles.org_id`, con rol `owner` o `admin`.
 *
 * CÓMO SE REPARTEN LOS CÓDIGOS
 * ----------------------------
 *  - `401` — no hay credencial, o la que hay no es válida (token inexistente o
 *    vencido, sesión ausente). No se distingue "no enviaste nada" de "tu token no
 *    existe": distinguirlos convertiría la ruta en un confirmador de tokens.
 *  - `403` — la credencial es válida pero acredita OTRA vacante u otra
 *    organización que la de la fila.
 *  - `422` — la vacante no resuelve a ninguna organización. Sin organización no
 *    hay pertenencia que comprobar; es el código que la ruta ya devolvía para
 *    esta condición exacta.
 *  - `500` — una consulta de autorización falló. Nunca se traduce a `403`: un
 *    fallo de la base no es una decisión de autorización.
 *
 * En todos los rechazos el mensaje es genérico y ninguna función de este módulo
 * escribe, así que un rechazo garantiza que la tabla queda sin cambios.
 *
 * UN TICKET YA CONSUMIDO SÍ ACREDITA
 * ----------------------------------
 * Está razonado en `resolveInterviewTicketCredential`
 * (`src/lib/interview-tickets/service.ts`): el ticket se quema al entrar a la
 * sala, así que TODAS las escrituras del flujo de ticket llegan con
 * `used = true`. Exigir `used = false` dejaría a cada candidato sin poder
 * guardar su propia entrevista. Lo que sí se exige es la vigencia.
 */

/** Prefijo estable para filtrar en los logs los fallos de estas consultas. */
const LOG_PREFIX = '[candidate-results/access-proof]';

/**
 * Credencial ya presentada: un token del cuerpo o una sesión comprobada.
 *
 * `session` no viene del cuerpo — se deduce de las cookies cuando el cuerpo no
 * trae ningún token.
 */
export type CandidateResultCredential =
  | CandidateResultAccessProof
  | { kind: 'session'; userId: string };

export type CandidateResultAccessDenialReason =
  | 'no-credential'
  | 'session-check-failed'
  | 'invalid-ticket-token'
  | 'expired-ticket-token'
  | 'ticket-role-mismatch'
  | 'ticket-lookup-failed'
  | 'invalid-public-token'
  | 'public-token-role-mismatch'
  | 'public-token-lookup-failed'
  | 'role-without-organization'
  | 'role-lookup-failed'
  | 'not-an-org-admin'
  | 'membership-check-failed';

export interface CandidateResultAccessDenial {
  ok: false;
  status: 401 | 403 | 422 | 500;
  reason: CandidateResultAccessDenialReason;
  /** Mensaje apto para devolver al cliente: genérico y sin datos de otras filas. */
  message: string;
}

export interface CandidateResultAccessGrant {
  ok: true;
  /** Con qué se autorizó. Va al log, no al cliente. */
  via: CandidateResultCredential['kind'];
  /** Vacante acreditada por la credencial. */
  roleId: string;
  /** Organización dueña de esa vacante, resuelta SIEMPRE en el servidor. */
  orgId: string;
}

export type CandidateResultCredentialResult =
  | { ok: true; credential: CandidateResultCredential }
  | CandidateResultAccessDenial;

export type CandidateResultAccessResult =
  | CandidateResultAccessGrant
  | CandidateResultAccessDenial;

const denied = (
  status: CandidateResultAccessDenial['status'],
  reason: CandidateResultAccessDenialReason,
  message: string,
): CandidateResultAccessDenial => ({ ok: false, status, reason, message });

/** Fila de `roles` que resuelve el enlace público. */
const publicRoleRowSchema = z.looseObject({
  id: z.string(),
  org_id: z.string().nullable(),
});

/**
 * Exige que la petición traiga alguna credencial.
 *
 * Si el cuerpo no trae token, la credencial candidata es la sesión: es el camino
 * del panel. Sin token y sin sesión no hay nada que comprobar y la respuesta es
 * `401`, decidida antes de leer `candidate_results`.
 */
export async function requireCandidateResultCredential(
  proof: CandidateResultAccessProof | null,
): Promise<CandidateResultCredentialResult> {
  if (proof) return { ok: true, credential: proof };

  const session = await requireOrgSession();

  if (!session.ok) {
    return session.reason === 'no-session'
      ? denied(401, 'no-credential', 'Unauthorized')
      : denied(500, 'session-check-failed', session.message);
  }

  return { ok: true, credential: { kind: 'session', userId: session.userId } };
}

/**
 * Comprueba que la credencial acredita `roleId`, y resuelve su organización.
 *
 * `roleId` lo elige el llamante según la operación: en el `POST` es el del
 * cuerpo, y en el `PATCH` es el de la fila que se va a modificar — así el
 * `PATCH` no puede tocar una fila de otra entrevista aunque la credencial sea
 * válida.
 */
export async function authorizeCredentialForRole(
  credential: CandidateResultCredential,
  roleId: string,
  now: number = Date.now(),
): Promise<CandidateResultAccessResult> {
  if (credential.kind === 'ticket') {
    return authorizeTicketToken(credential.token, roleId, now);
  }

  if (credential.kind === 'public-link') {
    return authorizePublicToken(credential.token, roleId);
  }

  return authorizeSession(credential.userId, roleId);
}

async function authorizeTicketToken(
  token: string,
  roleId: string,
  now: number,
): Promise<CandidateResultAccessResult> {
  const ticket = await resolveInterviewTicketCredential(token, now);

  if (ticket.status === 'error') {
    return denied(500, 'ticket-lookup-failed', 'Could not validate the access proof');
  }

  if (ticket.status === 'not_found') {
    return denied(401, 'invalid-ticket-token', 'Unauthorized');
  }

  // Un token vencido ya no acredita nada, así que es `401` y no `403`: la
  // credencial no es válida, no es que sea válida para otra vacante. Un ticket
  // CONSUMIDO, en cambio, sí acredita — es el estado normal de las escrituras.
  if (ticket.status === 'expired') {
    return denied(401, 'expired-ticket-token', 'Unauthorized');
  }

  if (ticket.roleId !== roleId) {
    return denied(403, 'ticket-role-mismatch', 'Forbidden');
  }

  return grantForRole('ticket', roleId);
}

async function authorizePublicToken(
  token: string,
  roleId: string,
): Promise<CandidateResultAccessResult> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('roles')
    .select('id, org_id')
    .eq('public_token', token)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} public token lookup failed:`, error.message);
    return denied(500, 'public-token-lookup-failed', 'Could not validate the access proof');
  }

  const roleRow = publicRoleRowSchema.safeParse(data);

  // Token inexistente y fila ilegible comparten respuesta, por el mismo motivo
  // que en el ticket: no delatar qué tokens existen.
  if (!roleRow.success) {
    return denied(401, 'invalid-public-token', 'Unauthorized');
  }

  if (roleRow.data.id !== roleId) {
    return denied(403, 'public-token-role-mismatch', 'Forbidden');
  }

  const orgId = roleRow.data.org_id ?? '';

  if (orgId.length === 0) {
    return denied(
      422,
      'role-without-organization',
      `Unable to resolve the organization for roleId ${roleId}`,
    );
  }

  return { ok: true, via: 'public-link', roleId, orgId };
}

async function authorizeSession(
  userId: string,
  roleId: string,
): Promise<CandidateResultAccessResult> {
  const authorization = await authorizeOrgRoleAccess(userId, roleId);

  if (!authorization.ok) {
    return denied(authorization.status, authorization.reason, authorization.message);
  }

  return { ok: true, via: 'session', roleId, orgId: authorization.orgId };
}

/**
 * Resuelve la organización de la vacante ya acreditada por un token.
 *
 * El camino de la sesión no pasa por aquí porque `authorizeOrgRoleAccess` ya la
 * resuelve —con el mismo helper— para poder comprobar la pertenencia.
 */
async function grantForRole(
  via: CandidateResultCredential['kind'],
  roleId: string,
): Promise<CandidateResultAccessResult> {
  const organization = await resolveRoleOrganization(roleId);

  if (!organization.ok) {
    return denied(organization.status, organization.reason, organization.message);
  }

  return { ok: true, via, roleId, orgId: organization.orgId };
}
