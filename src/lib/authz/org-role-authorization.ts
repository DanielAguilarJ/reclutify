import 'server-only';

import { TrainingAuthError, requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Autorización compartida "sesión + organización dueña de una vacante".
 *
 * DE DÓNDE SALE ESTE MÓDULO
 * -------------------------
 * La lógica vivía completa en `src/lib/invites/session-authorization.ts`, que la
 * escribió para `/api/invite-candidates`. Cuando `/api/candidate-results` tuvo
 * que aceptar también la sesión del panel como prueba de acceso (el camino de
 * `/admin/pipeline`, que no tiene token de candidato), había dos opciones:
 * copiar la comprobación o extraerla. Está extraída aquí, y el módulo de
 * invitaciones la reexporta con sus nombres de siempre: hay UNA sola definición
 * de "quién puede escribir en nombre de la organización dueña de un `roleId`".
 *
 * QUÉ DECIDE
 * ----------
 *  - `requireOrgSession`: exige sesión de Supabase. `401` si no hay usuario,
 *    `500` si la consulta de sesión falla. Nunca "permite por omisión".
 *  - `resolveRoleOrganization`: resuelve la organización SIEMPRE en el servidor
 *    a partir del `roleId`. Nunca se acepta del cuerpo de la petición: aceptarla
 *    haría trivial satisfacer cualquier comprobación de pertenencia —bastaría
 *    enviar la organización propia—.
 *  - `authorizeOrgRoleAccess`: pertenencia del usuario a esa organización con un
 *    rol que puede escribir (`owner` / `admin`).
 *
 * POR QUÉ NO SE REUTILIZA `requireOrgAdmin`
 * -----------------------------------------
 * `requireOrgAdmin` (`src/lib/training/auth.ts`) solo mira `org_members`, y en
 * este producto esa no es la única señal de pertenencia. La organización activa
 * de una cuenta de empresa es `user_profiles.org_id` — así la resuelve
 * `/api/training/diagnostics`, así concede acceso `getCoachSettings` y así carga
 * el panel su propio `orgId` (`adminStore.fetchFromSupabase`) — mientras que la
 * fila de `org_members` la inserta el onboarding en modo "mejor esfuerzo"
 * (`src/app/actions/onboarding.ts`: el fallo del insert no bloquea). Exigir
 * `org_members` como única fuente devolvería `403` al dueño legítimo de la
 * organización cuya fila nunca se creó.
 *
 * Todas las consultas van con la clave de servicio, igual que `requireOrgAdmin`:
 * la decisión de permisos no puede depender de que las políticas RLS de lectura
 * estén desplegadas, o un despliegue a medias se convertiría en un `403` para el
 * dueño de la organización.
 *
 * Ninguna función de este módulo escribe: un rechazo garantiza cero cambios.
 */

/** Prefijo estable para filtrar en los logs los fallos de estas consultas. */
const LOG_PREFIX = '[authz/org-role]';

/**
 * Roles de la organización que pueden escribir en su nombre.
 *
 * Es el mismo nivel de privilegio que ya exigen el resto de acciones de
 * administración del repo: `requireOrgAdmin`/`requireProgramAdmin`
 * (`src/lib/training/auth.ts`), `updateCompanyProfile`
 * (`src/app/actions/company.ts`) y la búsqueda de administrador de
 * `/api/info-notify`.
 *
 * No excluye a nadie que hoy necesite escribir: el onboarding de empresa crea la
 * cuenta con `role: 'owner'` en `user_profiles` y en `org_members`. Las cuentas
 * de candidato quedan fuera por partida doble — su rol es `member` y su `org_id`
 * es nulo.
 */
export const ORG_WRITE_ALLOWED_ROLES = ['owner', 'admin'] as const;

/** Motivo del rechazo. Va al log del servidor, no al cliente. */
export type OrgAuthRejection =
  | 'no-session'
  | 'session-check-failed'
  | 'role-without-organization'
  | 'role-lookup-failed'
  | 'not-an-org-admin'
  | 'membership-check-failed';

export type OrgSessionRejection = Extract<
  OrgAuthRejection,
  'no-session' | 'session-check-failed'
>;

export type OrgSessionResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      status: 401 | 500;
      reason: OrgSessionRejection;
      /** Mensaje apto para devolver al cliente. */
      message: string;
    };

export type RoleOrganizationRejection = Extract<
  OrgAuthRejection,
  'role-without-organization' | 'role-lookup-failed'
>;

export type RoleOrganizationLookup =
  | { ok: true; orgId: string }
  | {
      ok: false;
      status: 422 | 500;
      reason: RoleOrganizationRejection;
      /** Mensaje apto para devolver al cliente. */
      message: string;
    };

export type OrgRoleAuthorization =
  | { ok: true; orgId: string; role: string }
  | {
      ok: false;
      status: 403 | 422 | 500;
      reason: Exclude<OrgAuthRejection, OrgSessionRejection>;
      /** Mensaje apto para devolver al cliente. */
      message: string;
    };

/** Cliente de servicio, tipado desde su fábrica para no escribir `any`. */
export type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Exige una sesión autenticada.
 *
 * Conviene llamarla antes de leer el cuerpo de la petición: un rechazo aquí
 * garantiza cero escrituras y cero consultas a las tablas del producto.
 */
export async function requireOrgSession(): Promise<OrgSessionResult> {
  try {
    const user = await requireAuthenticatedUser();
    return { ok: true, userId: user.id };
  } catch (error) {
    // `requireAuthenticatedUser` ya separa los dos casos; aquí solo se traduce
    // su excepción al resultado que la ruta sabe mapear. Cualquier otra
    // excepción (por ejemplo, un fallo al construir el cliente) sube y la
    // convierte en `500` el `catch` de la ruta.
    if (error instanceof TrainingAuthError) {
      if (error.status === 401) {
        return { ok: false, status: 401, reason: 'no-session', message: 'Unauthorized' };
      }

      return {
        ok: false,
        status: 500,
        reason: 'session-check-failed',
        message: 'Could not validate authentication',
      };
    }

    throw error;
  }
}

/**
 * Resuelve la organización dueña de una vacante.
 *
 * `422` cuando el `roleId` no resuelve a ninguna organización: sin organización
 * no hay pertenencia que comprobar, y es el código que ya devolvían para esta
 * condición exacta `/api/invite-candidates` y `/api/candidate-results`.
 */
export async function resolveRoleOrganization(
  roleId: string,
  admin: AdminClient = createAdminClient(),
): Promise<RoleOrganizationLookup> {
  const { data, error } = await admin
    .from('roles')
    .select('org_id')
    .eq('id', roleId)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} role lookup failed:`, error);

    return {
      ok: false,
      status: 500,
      reason: 'role-lookup-failed',
      message: 'Could not resolve the organization for this role',
    };
  }

  const orgId = typeof data?.org_id === 'string' ? data.org_id : '';

  if (orgId.length === 0) {
    return {
      ok: false,
      status: 422,
      reason: 'role-without-organization',
      // El mensaje no filtra nada: `roles` es legible por `anon`, así que la
      // existencia de un `roleId` no es información privada. Lo que sí se evita
      // es nombrar la organización.
      message: `Unable to resolve the organization for roleId ${roleId}`,
    };
  }

  return { ok: true, orgId };
}

/**
 * Veredicto de una fuente de pertenencia.
 *
 * `unknown` existe para no confundir "la consulta falló" con "el usuario no
 * pertenece": un error de la tabla multi-organización no es una decisión de
 * autorización, así que se pregunta a la otra fuente. Si ninguna responde, el
 * resultado es `500` y no un `403` inventado ni —peor— un permiso concedido.
 */
type MembershipVerdict =
  | { verdict: 'allowed'; role: string }
  | { verdict: 'denied' }
  | { verdict: 'unknown' };

function isOrgWriteAllowedRole(role: unknown): role is string {
  return (
    typeof role === 'string' &&
    (ORG_WRITE_ALLOWED_ROLES as readonly string[]).includes(role)
  );
}

/** Fuente 1: la tabla de pertenencia explícita (soporte multi-organización). */
async function readOrgMemberRole(
  admin: AdminClient,
  userId: string,
  orgId: string,
): Promise<MembershipVerdict> {
  const { data, error } = await admin
    .from('org_members')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} org_members lookup failed:`, error);
    return { verdict: 'unknown' };
  }

  const role: unknown = data?.role;

  return isOrgWriteAllowedRole(role) ? { verdict: 'allowed', role } : { verdict: 'denied' };
}

/**
 * Fuente 2: la organización principal de la cuenta. Es lo que el panel de
 * empresa usa como organización activa, y para muchas cuentas es la única fila
 * que existe.
 */
async function readProfileRole(
  admin: AdminClient,
  userId: string,
  orgId: string,
): Promise<MembershipVerdict> {
  const { data, error } = await admin
    .from('user_profiles')
    .select('org_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} user_profiles lookup failed:`, error);
    return { verdict: 'unknown' };
  }

  const profileOrgId: unknown = data?.org_id;
  const role: unknown = data?.role;

  return profileOrgId === orgId && isOrgWriteAllowedRole(role)
    ? { verdict: 'allowed', role }
    : { verdict: 'denied' };
}

/**
 * Comprueba que `userId` puede escribir en nombre de la organización dueña de
 * `roleId`.
 *
 * No escribe nada, así que un rechazo garantiza que no hubo cambios.
 */
export async function authorizeOrgRoleAccess(
  userId: string,
  roleId: string,
): Promise<OrgRoleAuthorization> {
  const admin = createAdminClient();

  const organization = await resolveRoleOrganization(roleId, admin);
  if (!organization.ok) return organization;

  const { orgId } = organization;

  const membership = await readOrgMemberRole(admin, userId, orgId);
  if (membership.verdict === 'allowed') {
    return { ok: true, orgId, role: membership.role };
  }

  const profile = await readProfileRole(admin, userId, orgId);
  if (profile.verdict === 'allowed') {
    return { ok: true, orgId, role: profile.role };
  }

  if (membership.verdict === 'unknown' && profile.verdict === 'unknown') {
    return {
      ok: false,
      status: 500,
      reason: 'membership-check-failed',
      message: 'Could not validate organization membership',
    };
  }

  return {
    ok: false,
    status: 403,
    reason: 'not-an-org-admin',
    // Mismo mensaje para "no eres miembro" y "tu rol no alcanza": quien llama no
    // necesita saber cuál de los dos, y distinguirlos permitiría sondear qué
    // organización es dueña de qué vacante.
    message: 'Forbidden',
  };
}
