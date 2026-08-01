import 'server-only';

import type { User } from '@supabase/supabase-js';

import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

import { ApiError } from './errors';

/**
 * Identidad y pertenencia a organización para los route handlers del panel.
 *
 * QUÉ AÑADE SOBRE LO QUE YA HABÍA
 * -------------------------------
 * `src/lib/training/auth.ts` ya resuelve esto para el centro de capacitación,
 * pero lanza `TrainingAuthError`, que solo entiende `trainingApiErrorResponse`.
 * Este módulo hace lo mismo lanzando `ApiError`, que es lo que consume
 * `handleApiError`. La lógica de pertenencia NO se duplica: se delega en
 * `resolveOrgMembership`, que aplica las dos fuentes que el producto reconoce
 * (ver más abajo).
 *
 * POR QUÉ `getUser()` Y NUNCA `getSession()`
 * ------------------------------------------
 * `getSession()` solo decodifica el JWT que hay en la cookie, sin comprobar su
 * firma contra el servidor de autenticación: un token manipulado pasa la
 * comprobación. `getUser()` valida contra Supabase. En el servidor la diferencia
 * es la que separa una comprobación real de una decorativa.
 *
 * Este repositorio ya no usaba `getSession()` en ningún camino de producción
 * cuando se escribió este módulo; la regla queda aquí para que no vuelva a
 * entrar.
 *
 * DOS FUENTES DE PERTENENCIA, Y POR QUÉ
 * -------------------------------------
 * `org_members` es la tabla de pertenencia explícita (soporte multi-organización),
 * pero la organización activa de una cuenta de empresa es `user_profiles.org_id`,
 * y la fila de `org_members` la inserta el onboarding en modo «mejor esfuerzo»
 * (`src/app/actions/onboarding.ts`: el fallo del insert no bloquea el alta).
 *
 * Exigir solo `org_members` devolvería `403` al dueño legítimo de una
 * organización cuya fila nunca se creó. El mismo razonamiento está desarrollado
 * en `src/lib/authz/org-role-authorization.ts`, que resuelve el caso análogo
 * partiendo de un `roleId`; aquí se parte del usuario.
 *
 * Todas las consultas van con la clave de servicio, igual que allí: una decisión
 * de permisos no puede depender de que las políticas RLS de LECTURA estén
 * desplegadas, o un despliegue a medias se convierte en un `403` para el dueño.
 */

/** Roles de organización que pueden escribir en su nombre. */
export const ORG_WRITE_ROLES = ['owner', 'admin'] as const;

export type OrgWriteRole = (typeof ORG_WRITE_ROLES)[number];

/** Usuario autenticado más la organización a la que pertenece. */
export interface OrgMembership {
  user: User;
  orgId: string;
  role: string;
}

/**
 * Exige una sesión válida.
 *
 * Conviene llamarla ANTES de leer el cuerpo de la petición: un rechazo aquí
 * garantiza que no se hizo ninguna consulta a las tablas del producto ni ninguna
 * llamada a un proveedor externo de pago.
 *
 * @throws {ApiError} 401 si no hay sesión; 500 si la consulta de sesión falla.
 */
export async function requireApiUser(): Promise<User> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    // Un fallo de la consulta de sesión NO es «no autenticado»: devolver 401
    // aquí haría que una incidencia de Supabase se viera como un problema de
    // credenciales del usuario, y mandaría al cliente a reintentar el login.
    throw ApiError.misconfigured('Could not validate authentication', error);
  }

  if (!data.user) throw ApiError.unauthorized();

  return data.user;
}

/**
 * Devuelve el usuario autenticado o `null`, sin lanzar.
 *
 * Para rutas de acceso mixto que solo necesitan la identidad si existe: por
 * ejemplo, para elegir el identificador del limitador de tasa.
 */
export async function getOptionalApiUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}

/** Veredicto de una de las dos fuentes de pertenencia. */
type MembershipLookup = { found: true; orgId: string; role: string } | { found: false };

/** Fuente 1: la tabla de pertenencia explícita. */
async function readOrgMembersRow(userId: string): Promise<MembershipLookup> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', userId)
    .in('role', [...ORG_WRITE_ROLES])
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[api/auth] org_members lookup failed:', error.message);
    return { found: false };
  }

  return data?.org_id && data.role
    ? { found: true, orgId: data.org_id, role: data.role }
    : { found: false };
}

/** Fuente 2: la organización principal del perfil. */
async function readProfileOrg(userId: string): Promise<MembershipLookup> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('user_profiles')
    .select('org_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[api/auth] user_profiles lookup failed:', error.message);
    return { found: false };
  }

  const role = typeof data?.role === 'string' ? data.role : '';

  return data?.org_id && (ORG_WRITE_ROLES as readonly string[]).includes(role)
    ? { found: true, orgId: data.org_id, role }
    : { found: false };
}

/**
 * Exige sesión Y pertenencia a alguna organización con permiso de escritura.
 *
 * Es la comprobación de las rutas del panel que no reciben un identificador de
 * recurso y actúan sobre «mi organización»: generación de rúbricas, envío de
 * invitaciones, prueba de integraciones.
 *
 * @returns Usuario, organización resuelta EN EL SERVIDOR y rol.
 * @throws {ApiError} 401 sin sesión; 403 si la cuenta no administra ninguna
 *   organización.
 */
export async function requireOrgMembership(): Promise<OrgMembership> {
  const user = await requireApiUser();

  const fromMembers = await readOrgMembersRow(user.id);
  if (fromMembers.found) {
    return { user, orgId: fromMembers.orgId, role: fromMembers.role };
  }

  const fromProfile = await readProfileOrg(user.id);
  if (fromProfile.found) {
    return { user, orgId: fromProfile.orgId, role: fromProfile.role };
  }

  // Mismo mensaje para «no perteneces a ninguna organización» y «tu rol no
  // alcanza»: quien llama no necesita distinguirlos, y distinguirlos permitiría
  // sondear la estructura de organizaciones de la plataforma.
  throw ApiError.forbidden();
}

/**
 * Exige que el usuario administre la organización `orgId` concreta.
 *
 * Para rutas que reciben un `orgId` del cliente. La comprobación es de igualdad
 * contra la organización resuelta en el servidor, así que un `orgId` ajeno en el
 * cuerpo se rechaza en lugar de usarse.
 *
 * @throws {ApiError} 403 si la organización resuelta no coincide.
 */
export async function requireOrgAccess(orgId: string): Promise<OrgMembership> {
  const membership = await requireOrgMembership();

  if (membership.orgId !== orgId) throw ApiError.forbidden();

  return membership;
}
