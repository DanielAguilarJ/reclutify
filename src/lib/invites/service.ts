import 'server-only';

import { resolveAppBaseUrl } from '@/lib/app-url';
import { createAdminClient } from '@/utils/supabase/admin';

import type { InviteCandidatesRequest } from './contracts';
import { generateInviteToken, generateTicketId } from './token';

/**
 * Creación de invitaciones de entrevista.
 *
 * POR QUÉ ES UN MÓDULO Y NO SOLO UNA RUTA
 * ---------------------------------------
 * Esta lógica vivía dentro de `/api/invite-candidates`, y `applyToJob`
 * (`src/app/actions/jobs.ts`, la postulación pública a vacantes) la consumía
 * haciendo un `fetch` HTTP a su propio backend. Esa llamada era la razón por la
 * que el endpoint no podía cerrarse: cualquier credencial que se le exigiera
 * rompía las postulaciones, porque el candidato no tiene ninguna.
 *
 * `applyToJob` es un server action, así que ya corre en el servidor: el salto
 * por HTTP no aportaba nada y no tenía forma de autenticarse. Extraída aquí, la
 * ruta queda como una envoltura con autorización y el server action invoca la
 * misma función directamente. Ambos caminos producen el mismo resultado
 * observable para la misma entrada.
 *
 * POR QUÉ SE ESCRIBE CON `service_role`
 * -------------------------------------
 * Las dos escrituras van con `createAdminClient()`:
 *
 *  - `candidate_invites` tiene RLS activo sin políticas de escritura para
 *    `anon`/`authenticated` (`202607290003_candidate_invites_rls.sql`), así que
 *    solo la clave de servicio puede insertar. Ya era así antes.
 *  - `interview_tickets` usaba el cliente de sesión, y su política
 *    `org_tickets_insert` exige `authenticated` con organización coincidente.
 *    En las llamadas sin sesión —las de Make y las de la postulación pública—
 *    ese insert fallaba en silencio y solo sobrevivía el espejo en
 *    `candidate_invites`: el candidato recibía un enlace `/interview/t/{token}`
 *    sin ticket detrás, es decir, la pantalla de ticket inválido. Con la clave
 *    de servicio el ticket se crea siempre, que es lo que el flujo necesita.
 *
 * LA AUTORIZACIÓN ES RESPONSABILIDAD DEL LLAMANTE
 * -----------------------------------------------
 * Esta función bypassa RLS y no comprueba identidad ni permisos: no puede, uno
 * de sus dos llamantes corre sin sesión. Cada uno aporta su propia garantía, y
 * el contrato de esta función no cambia por ello:
 *
 *  - `/api/invite-candidates` autentica por sesión de Supabase y exige que el
 *    usuario pertenezca, con rol `owner` o `admin`, a la organización dueña del
 *    `roleId` (`src/lib/invites/session-authorization.ts`). Es el camino de una
 *    persona del equipo invitando a su propia hornada de candidatos.
 *  - `applyToJob` corre sin sesión —el candidato es público— y solo llama aquí
 *    después de haber registrado con éxito una postulación a una vacante
 *    publicada: el `roleId` no lo elige quien invita, sale de la vacante a la
 *    que la persona acaba de postularse, y la invitación es para su propio
 *    correo. Por eso este módulo sigue usando `service_role` y no una sesión.
 *
 * Cualquier llamante nuevo tiene que traer su propia garantía equivalente antes
 * de invocarla.
 */

/** Vigencia del ticket. Es el mismo valor que aplicaba la ruta original. */
const TICKET_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Último recurso para la URL base. `resolveAppBaseUrl()` cubre
 * `NEXT_PUBLIC_APP_URL` y las variables que inyecta la plataforma; este valor
 * solo aparece si no hay ninguna, y es el mismo que la ruta usaba de reserva.
 */
const FALLBACK_BASE_URL = 'https://reclutify.com';

/** Resultado por candidato. Misma forma que devolvía la ruta original. */
export interface CreatedInvite {
  /** `candidate_invites.id`: el correo, como en la implementación anterior. */
  candidateId: string;
  email: string;
  token: string;
  interviewLink: string;
  /** `true` solo si el ticket y su espejo se insertaron sin error. */
  inserted: boolean;
}

/**
 * Crea un ticket de entrevista y su fila espejo por cada candidato.
 *
 * Los errores de inserción no abortan el lote: se registran y el candidato
 * afectado sale con `inserted: false`, igual que antes. Una excepción de
 * configuración (por ejemplo, `SUPABASE_SERVICE_ROLE_KEY` ausente) sí sale
 * hacia arriba, porque afecta a todo el lote y no a un destinatario.
 */
export async function createCandidateInvites(
  input: InviteCandidatesRequest,
): Promise<CreatedInvite[]> {
  const { roleId, roleTitle, candidates } = input;

  const baseUrl = resolveAppBaseUrl() ?? FALLBACK_BASE_URL;
  const ticketLanguage: 'en' | 'es' = input.language === 'en' ? 'en' : 'es';
  const admin = createAdminClient();

  // `interview_tickets` está acotada por organización. El `org_id` se resuelve
  // en el servidor a partir del `roleId` y nunca se acepta del cliente: es la
  // misma regla que aplica `/api/candidate-results`.
  const { data: roleRow, error: roleError } = await admin
    .from('roles')
    .select('org_id')
    .eq('id', roleId)
    .maybeSingle();

  if (roleError) {
    console.error('[invites] role lookup failed:', roleError.message);
  }

  const orgId = (roleRow?.org_id as string | null | undefined) ?? null;

  const results: CreatedInvite[] = [];

  for (const candidate of candidates) {
    const now = Date.now();
    const token = generateInviteToken();
    const ticketId = generateTicketId(now);
    const interviewLink = `${baseUrl}/interview/t/${token}`;

    // 1) El ticket: es lo que lee `/interview/t/[token]`. Sin esta fila el
    //    enlace lleva a la pantalla de "ticket inválido".
    const { error: ticketError } = await admin.from('interview_tickets').insert({
      id: ticketId,
      token,
      candidate_name: candidate.name || candidate.email,
      role_id: roleId,
      language: ticketLanguage,
      created_at: now,
      expires_at: now + TICKET_TTL_MS,
      used: false,
      org_id: orgId,
    });

    if (ticketError) {
      console.error('[invites] ticket insert failed:', ticketError.message);
    }

    // 2) El espejo en `candidate_invites`: tabla de seguimiento heredada que
    //    consumen el panel de administración y las integraciones externas.
    const candidateId = candidate.email;
    const { error: inviteError } = await admin.from('candidate_invites').insert({
      id: candidateId,
      role_id: roleId,
      role_title: roleTitle,
      candidate_email: candidate.email,
      candidate_name: candidate.name || '',
      interview_link: interviewLink,
      status: 'pending',
    });

    if (inviteError) {
      console.error('[invites] invite insert failed:', inviteError.message);
    }

    results.push({
      candidateId,
      email: candidate.email,
      token,
      interviewLink,
      inserted: !ticketError && !inviteError,
    });
  }

  return results;
}
