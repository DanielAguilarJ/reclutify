import 'server-only';

import { TrainingAuthError, requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Autorización de `/api/invite-candidates`.
 *
 * QUÉ SE ARREGLA
 * --------------
 * La comprobación original era esta:
 *
 * ```ts
 * const secret = req.headers.get('x-api-key');
 * if (secret && secret !== process.env.MAKE_WEBHOOK_SECRET) {
 *   // return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 *   console.warn("x-api-key did not match MAKE_WEBHOOK_SECRET");
 * }
 * ```
 *
 * Tenía dos fallos independientes, y cada uno bastaba para dejar la ruta
 * abierta: el `return` estaba comentado, y la condición empezaba por
 * `secret &&`, así que **omitir** la cabecera saltaba la comprobación entera.
 * Con eso cualquiera podía crear tickets de entrevista e insertar filas en
 * `candidate_invites` para la organización de cualquier `roleId` — y los
 * `roleId` son públicamente listables, porque `roles` tiene la política
 * `anon_roles_select USING (true)`.
 *
 * POR QUÉ NO SE ARREGLA CON UN SECRETO COMPARTIDO
 * -----------------------------------------------
 * El primer intento de cierre exigía `x-api-key` contra `MAKE_WEBHOOK_SECRET`
 * para no cortar un escenario de Make. Ese consumidor no existe: no hay ninguna
 * integración externa en uso, y dentro del producto nadie llama a esta ruta
 * (`applyToJob` invoca `createCandidateInvites` directamente y el panel crea sus
 * tickets con `ticketStore`). Un secreto de proceso a proceso para una ruta cuyo
 * único llamante posible es una persona con sesión es el modelo equivocado:
 * añade una variable de entorno cuya ausencia deja el endpoint inservible (503)
 * y no dice **nada** sobre de quién es la organización que se está invitando.
 *
 * CÓMO SE DECIDE AHORA
 * --------------------
 * Sesión de Supabase + pertenencia a la organización dueña de la vacante:
 *
 *  - `401` si no hay usuario autenticado.
 *  - `422` si el `roleId` no resuelve a ninguna organización — sin organización
 *    no hay pertenencia que comprobar. Es el mismo código que ya devuelve
 *    `/api/candidate-results` para esta condición exacta ("Unable to resolve
 *    org_id for roleId"), y las dos rutas comparten la regla de resolver la
 *    organización en el servidor a partir del `roleId`.
 *  - `403` si el usuario no pertenece a esa organización, o pertenece con un rol
 *    que no puede invitar.
 *  - `500` si ninguna de las dos fuentes de pertenencia puede responder.
 *
 * Ninguna comprobación depende de una cabecera, así que ninguna se puede saltar
 * omitiéndola: ese era el fallo original. Y ningún camino acepta la petición
 * "por omisión" — la única salida `ok: true` exige un usuario y una pertenencia
 * confirmada.
 *
 * QUÉ SE REUTILIZA Y QUÉ NO
 * -------------------------
 * La parte de sesión es `requireAuthenticatedUser` (`src/lib/training/auth.ts`)
 * tal cual: ya distingue "no hay sesión" (401) de "la consulta de sesión falló"
 * (500), que es justo la distinción que aquí hace falta.
 *
 * Lo que NO se reutiliza es `requireOrgAdmin`, y no por gusto: solo mira
 * `org_members`, y en este producto esa no es la única señal de pertenencia. La
 * organización activa de una cuenta de empresa es `user_profiles.org_id` — así
 * la resuelve `/api/training/diagnostics` y así concede acceso
 * `getCoachSettings` (`src/app/actions/coach-settings.ts`) — mientras que la
 * fila de `org_members` la inserta el onboarding en modo "mejor esfuerzo"
 * (`src/app/actions/onboarding.ts`: el fallo del insert no bloquea, y
 * `src/app/actions/organizations.ts` documenta que la tabla puede no existir
 * todavía). Exigir `org_members` como única fuente devolvería `403` al dueño
 * legítimo de la organización cuya fila nunca se creó. Extraer un helper común
 * obligaría a editar el módulo de capacitación, que está fuera del alcance de
 * este cambio; por eso la comprobación de pertenencia vive aquí y replica el
 * patrón (cliente de servicio + `user_profiles`/`org_members`) en lugar de
 * moverlo.
 */

/** Prefijo estable para filtrar los rechazos de autorización en los logs. */
export const PUBLIC_FLOW_AUTH_LOG_PREFIX = '[public-flow-auth]';

/**
 * Roles de la organización que pueden invitar candidatos.
 *
 * Invitar no es una lectura: crea filas en `interview_tickets` con la clave de
 * servicio, consume la cuota de entrevistas de la organización
 * (`organizations.max_interviews_per_month`) y produce enlaces que salen por
 * correo en nombre de la empresa. Es el mismo nivel de privilegio que el resto
 * de acciones de administración del repo, que ya exigen `owner` o `admin`:
 * `requireOrgAdmin`/`requireProgramAdmin` (`src/lib/training/auth.ts`),
 * `updateCompanyProfile` (`src/app/actions/company.ts`) y la búsqueda de
 * administrador de `/api/info-notify`.
 *
 * No excluye a nadie que hoy necesite invitar: el onboarding de empresa crea la
 * cuenta con `role: 'owner'` en `user_profiles` y en `org_members`. Las cuentas
 * de candidato quedan fuera por partida doble — su rol es `member` y su
 * `org_id` es nulo.
 */
export const INVITE_ALLOWED_ORG_ROLES = ['owner', 'admin'] as const;

/** Motivo del rechazo. Va al log del servidor, no al cliente. */
export type InviteAuthRejection =
  | 'no-session'
  | 'session-check-failed'
  | 'role-without-organization'
  | 'role-lookup-failed'
  | 'not-an-org-admin'
  | 'membership-check-failed';

export type InviteSessionResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      status: 401 | 500;
      reason: Extract<InviteAuthRejection, 'no-session' | 'session-check-failed'>;
      /** Mensaje apto para devolver al cliente. */
      message: string;
    };

export type InviteRoleAuthorization =
  | { ok: true; orgId: string; role: string }
  | {
      ok: false;
      status: 403 | 422 | 500;
      reason: Exclude<
        InviteAuthRejection,
        'no-session' | 'session-check-failed'
      >;
      /** Mensaje apto para devolver al cliente. */
      message: string;
    };

/**
 * Exige una sesión autenticada.
 *
 * Se ejecuta antes de leer el cuerpo de la petición: un rechazo aquí garantiza
 * cero escrituras y cero consultas a las tablas del producto.
 */
export async function requireInviteSession(): Promise<InviteSessionResult> {
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
        return {
          ok: false,
          status: 401,
          reason: 'no-session',
          message: 'Unauthorized',
        };
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

/** Cliente de servicio, tipado desde su fábrica para no escribir `any`. */
type AdminClient = ReturnType<typeof createAdminClient>;

function isInviteAllowedRole(role: unknown): role is string {
  return (
    typeof role === 'string' &&
    (INVITE_ALLOWED_ORG_ROLES as readonly string[]).includes(role)
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
    console.error('[invites/auth] org_members lookup failed:', error);
    return { verdict: 'unknown' };
  }

  const role: unknown = data?.role;

  return isInviteAllowedRole(role) ? { verdict: 'allowed', role } : { verdict: 'denied' };
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
    console.error('[invites/auth] user_profiles lookup failed:', error);
    return { verdict: 'unknown' };
  }

  const profileOrgId: unknown = data?.org_id;
  const role: unknown = data?.role;

  return profileOrgId === orgId && isInviteAllowedRole(role)
    ? { verdict: 'allowed', role }
    : { verdict: 'denied' };
}

/**
 * Comprueba que `userId` puede invitar candidatos para `roleId`.
 *
 * La organización se resuelve SIEMPRE en el servidor desde el `roleId` y nunca
 * se acepta del cuerpo de la petición: aceptarla haría trivial satisfacer la
 * comprobación de pertenencia — bastaría enviar la organización propia.
 *
 * No escribe nada, así que un rechazo garantiza que no hubo cambios.
 */
export async function authorizeInviteForRole(
  userId: string,
  roleId: string,
): Promise<InviteRoleAuthorization> {
  // Se consulta con la clave de servicio, igual que `requireOrgAdmin`: la
  // decisión de permisos no puede depender de que las políticas RLS de lectura
  // estén desplegadas, o un despliegue a medias se convertiría en un `403` para
  // el dueño de la organización.
  const admin = createAdminClient();

  const { data: roleRow, error: roleError } = await admin
    .from('roles')
    .select('org_id')
    .eq('id', roleId)
    .maybeSingle();

  if (roleError) {
    console.error('[invites/auth] role lookup failed:', roleError);

    return {
      ok: false,
      status: 500,
      reason: 'role-lookup-failed',
      message: 'Could not resolve the organization for this role',
    };
  }

  const orgId = typeof roleRow?.org_id === 'string' ? roleRow.org_id : '';

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
