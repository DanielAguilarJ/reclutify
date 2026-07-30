import 'server-only';

import {
  ORG_WRITE_ALLOWED_ROLES,
  authorizeOrgRoleAccess,
  requireOrgSession,
  type OrgAuthRejection,
  type OrgRoleAuthorization,
  type OrgSessionResult,
} from '@/lib/authz/org-role-authorization';

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
 *    `/api/candidate-results` para esta condición exacta, y las dos rutas
 *    comparten la regla de resolver la organización en el servidor a partir del
 *    `roleId`.
 *  - `403` si el usuario no pertenece a esa organización, o pertenece con un rol
 *    que no puede invitar.
 *  - `500` si ninguna de las dos fuentes de pertenencia puede responder.
 *
 * Ninguna comprobación depende de una cabecera, así que ninguna se puede saltar
 * omitiéndola: ese era el fallo original. Y ningún camino acepta la petición
 * "por omisión" — la única salida `ok: true` exige un usuario y una pertenencia
 * confirmada.
 *
 * DÓNDE VIVE AHORA LA DECISIÓN
 * ----------------------------
 * En `src/lib/authz/org-role-authorization.ts`. Este módulo es la fachada con
 * los nombres de dominio de las invitaciones y con el razonamiento de arriba;
 * la comprobación es una sola, compartida con `/api/candidate-results`, que
 * acepta la sesión del panel como prueba de acceso para el camino de
 * `/admin/pipeline`. Antes de esa segunda necesidad la lógica vivía completa
 * aquí, y `requireOrgAdmin` (`src/lib/training/auth.ts`) sigue sin servir para
 * el caso por el motivo documentado en el módulo compartido: solo mira
 * `org_members`, y la pertenencia real de una cuenta de empresa está en
 * `user_profiles.org_id`.
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
 * de acciones de administración del repo, y por eso es exactamente la lista
 * compartida `ORG_WRITE_ALLOWED_ROLES`.
 */
export const INVITE_ALLOWED_ORG_ROLES = ORG_WRITE_ALLOWED_ROLES;

/** Motivo del rechazo. Va al log del servidor, no al cliente. */
export type InviteAuthRejection = OrgAuthRejection;

export type InviteSessionResult = OrgSessionResult;

export type InviteRoleAuthorization = OrgRoleAuthorization;

/**
 * Exige una sesión autenticada.
 *
 * Se ejecuta antes de leer el cuerpo de la petición: un rechazo aquí garantiza
 * cero escrituras y cero consultas a las tablas del producto.
 */
export function requireInviteSession(): Promise<InviteSessionResult> {
  return requireOrgSession();
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
export function authorizeInviteForRole(
  userId: string,
  roleId: string,
): Promise<InviteRoleAuthorization> {
  return authorizeOrgRoleAccess(userId, roleId);
}
