'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

const ACTIVE_ORG_COOKIE = 'reclutify_active_org_id';

interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface OrgActionResult {
  success: boolean;
  error?: string;
}

interface AddWorkspaceResult {
  success: boolean;
  error?: string;
  redirectTo?: string;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
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

/**
 * Crea un workspace adicional para un usuario que ya completó el onboarding.
 * A diferencia de createOrganization (onboarding inicial), esta acción:
 * - No bloquea si el usuario ya tiene una org
 * - Agrega la nueva org a org_members para soporte multi-org
 * - Activa la nueva org via cookie
 */
export async function addWorkspace(formData: {
  name: string;
  size: string;
  industry: string;
}): Promise<AddWorkspaceResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'No se pudo verificar tu sesión. Por favor, inicia sesión nuevamente.' };
  }

  const trimmedName = formData.name?.trim() || '';
  if (trimmedName.length < 2) {
    return { success: false, error: 'El nombre de la empresa debe tener al menos 2 caracteres.' };
  }

  // Generar slug único
  let slug = generateSlug(trimmedName);
  if (!slug) slug = `org-${randomSuffix()}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const candidateSlug = attempt === 0 ? slug : `${slug}-${randomSuffix()}`;
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', candidateSlug)
      .maybeSingle();

    if (!existing) { slug = candidateSlug; break; }
    if (attempt === 2) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  }

  // Crear organización con UUID pre-generado (evita problemas de RLS en SELECT post-insert)
  const orgId = crypto.randomUUID();

  const { error: orgError } = await supabase
    .from('organizations')
    .insert([{ id: orgId, name: trimmedName, slug }]);

  if (orgError) {
    return { success: false, error: `Error al crear la organización: ${orgError.message}` };
  }

  // Vincular al usuario como owner en org_members
  const { error: memberError } = await supabase
    .from('org_members')
    .insert([{ user_id: user.id, org_id: orgId, role: 'owner' }]);

  if (memberError) {
    // Rollback de la organización creada
    await supabase.from('organizations').delete().eq('id', orgId);
    return { success: false, error: `Error al vincular la organización: ${memberError.message}` };
  }

  // Activar la nueva org via cookie
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/admin');

  return { success: true, redirectTo: '/admin' };
}
