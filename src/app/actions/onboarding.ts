'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

/**
 * Resultado tipado del Server Action de onboarding
 */
interface OnboardingResult {
  success: boolean;
  error?: string;
}

/**
 * Genera un slug URL-friendly a partir de un nombre.
 * Ejemplo: "Acme Corp" → "acme-corp"
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, ''); // Eliminar guiones al inicio/final
}

/**
 * Genera un sufijo alfanumérico aleatorio de 4 caracteres.
 * Ejemplo: "a3b2"
 */
function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return suffix;
}

/**
 * Server Action: Crea una organización y vincula al usuario como owner.
 *
 * Flujo:
 * 1. Obtener usuario autenticado (sesión garantizada en Server Action)
 * 2. Verificar que el usuario NO tenga ya una organización
 * 3. Generar slug único (con sufijo si hay colisión)
 * 4. Crear organización
 * 5. Crear perfil de usuario vinculado a la organización
 * 6. Crear membresía en org_members para soporte multi-org futuro
 * 7. Si algún paso falla, hacer rollback manual
 */
export async function createOrganization(formData: {
  name: string;
  size: string;
  industry: string;
}): Promise<OnboardingResult> {
  const supabase = await createClient();

  // ─── 1. Obtener usuario autenticado ───
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      success: false,
      error: 'No se pudo verificar tu sesión. Por favor, inicia sesión nuevamente.',
    };
  }

  // ─── 2. Verificar que el usuario no tenga ya una organización ───
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  if (existingProfile?.org_id) {
    // El usuario ya tiene una organización, no necesita crear otra
    redirect('/admin');
  }

  // ─── 3. Validar datos del formulario ───
  const trimmedName = formData.name.trim();
  if (!trimmedName) {
    return {
      success: false,
      error: 'El nombre de la empresa es obligatorio.',
    };
  }

  // ─── 4. Generar slug único ───
  let slug = generateSlug(trimmedName);
  if (!slug) {
    slug = `org-${randomSuffix()}`;
  }

  // Verificar colisión de slug e intentar hasta 3 veces con sufijo
  for (let attempt = 0; attempt < 3; attempt++) {
    const candidateSlug = attempt === 0 ? slug : `${slug}-${randomSuffix()}`;
    const { data: existing } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', candidateSlug)
      .single();

    if (!existing) {
      slug = candidateSlug;
      break;
    }

    if (attempt === 2) {
      // Último intento: forzar con timestamp
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }
  }

  // ─── 5. Crear la organización ───
  // Generamos el UUID aquí para no necesitar .select() (que falla por RLS SELECT policy
  // ya que el user_profile aún no está vinculado a esta org)
  const orgId = crypto.randomUUID();

  const { error: orgError } = await supabase
    .from('organizations')
    .insert([{
      id: orgId,
      name: trimmedName,
      slug,
    }]);

  if (orgError) {
    return {
      success: false,
      error: `Error al crear la organización: ${orgError?.message || 'Error desconocido'}`,
    };
  }

  // ─── 6. Crear/actualizar perfil de usuario ───
  const fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin';

  const { error: profileError } = await supabase
    .from('user_profiles')
    .upsert([{
      user_id: user.id,
      org_id: orgId,
      full_name: fullName,
      role: 'owner',
    }], { onConflict: 'user_id' });

  if (profileError) {
    // Rollback: eliminar la organización que acabamos de crear
    await supabase.from('organizations').delete().eq('id', orgId);

    return {
      success: false,
      error: `Error al crear tu perfil: ${profileError.message}. La organización fue revertida.`,
    };
  }

  // ─── 7. Crear membresía en org_members (para multi-org futuro) ───
  // Intentamos insertar, pero si la tabla no existe aún, no es crítico
  try {
    await supabase
      .from('org_members')
      .insert([{
        user_id: user.id,
        org_id: orgId,
        role: 'owner',
      }]);
  } catch {
    // Si org_members no existe todavía, no es un error bloqueante
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Onboarding] org_members table may not exist yet — skipping');
    }
  }

  return { success: true };
}
