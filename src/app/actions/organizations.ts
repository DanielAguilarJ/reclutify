'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Nombre de la cookie para la organización activa
const ACTIVE_ORG_COOKIE = 'reclutify_active_org_id';

/**
 * Tipo para la información de una organización del usuario
 */
interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

/**
 * Resultado tipado para las acciones de organizaciones
 */
interface OrgActionResult {
  success: boolean;
  error?: string;
}

/**
 * Obtiene todas las organizaciones a las que pertenece el usuario.
 * Busca tanto en user_profiles (org principal) como en org_members (multi-org).
 */
export async function getUserOrganizations(): Promise<UserOrganization[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return [];

  // Obtener la org principal del user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id, role')
    .eq('user_id', user.id)
    .single();

  if (!profile?.org_id) return [];

  // Obtener detalles de la org principal
  const { data: mainOrg } = await supabase
    .from('organizations')
    .select('id, name, slug')
    .eq('id', profile.org_id)
    .single();

  const orgs: UserOrganization[] = [];

  if (mainOrg) {
    orgs.push({
      id: mainOrg.id,
      name: mainOrg.name,
      slug: mainOrg.slug,
      role: profile.role || 'member',
    });
  }

  // Intentar obtener orgs adicionales de org_members (si la tabla existe)
  try {
    const { data: memberOrgs } = await supabase
      .from('org_members')
      .select('org_id, role, organizations(id, name, slug)')
      .eq('user_id', user.id);

    if (memberOrgs) {
      for (const membership of memberOrgs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const org = membership.organizations as any;
        if (org && !orgs.some(o => o.id === org.id)) {
          orgs.push({
            id: org.id,
            name: org.name,
            slug: org.slug,
            role: membership.role || 'member',
          });
        }
      }
    }
  } catch {
    // org_members podría no existir todavía — no es error
  }

  return orgs;
}

/**
 * Obtiene el ID de la organización activa.
 * Prioridad: cookie → org principal en user_profiles.
 */
export async function getActiveOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;

  if (cookieOrgId) {
    return cookieOrgId;
  }

  // Fallback: usar el org_id del perfil del usuario
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  return profile?.org_id || null;
}

/**
 * Cambia la organización activa del usuario.
 * Verifica que el usuario sea miembro de la org antes de cambiar.
 * Guarda el org activo en una cookie HTTP-only.
 */
export async function switchOrganization(orgId: string): Promise<OrgActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'No se pudo verificar tu sesión.' };
  }

  // Verificar que el usuario pertenece a esta organización
  // Primero checar user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  let isMember = profile?.org_id === orgId;

  // Si no es la org principal, checar org_members
  if (!isMember) {
    try {
      const { data: membership } = await supabase
        .from('org_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .single();

      isMember = !!membership;
    } catch {
      // org_members podría no existir
    }
  }

  if (!isMember) {
    return {
      success: false,
      error: 'No tienes acceso a esta organización.',
    };
  }

  // Guardar en cookie HTTP-only
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 año
  });

  // Refrescar los datos del admin panel
  revalidatePath('/admin');

  return { success: true };
}
