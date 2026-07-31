'use server';

import { z } from 'zod';

import { createClient } from '@/utils/supabase/server';

/**
 * Perfil y organización del coach.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * `/coach/settings` mostraba tres campos bajo «Perfil y Organización» —nombre de la organización,
 * nombre del coach y correo de contacto— que eran **decorativos**: vivían en `useState` local, no
 * se cargaban del servidor y `handleSave` no los miraba. El usuario los rellenaba, pulsaba
 * «Guardar Cambios», recargaba, y estaban vacíos otra vez.
 *
 * No era un fallo de guardado: no había ningún camino que llevara esos datos a la base. Y como
 * `coach_settings` no tiene columnas para ellos, la corrección no podía ser meterlos en el mismo
 * `upsert` que el resto de los ajustes.
 *
 * DÓNDE VA CADA UNO
 * -----------------
 *  - Nombre de la organización → `organizations.name`.
 *  - Nombre del coach → `user_profiles.full_name`.
 *  - Correo de contacto → es el correo de la CUENTA, que gestiona la autenticación de Supabase.
 *    No se escribe desde aquí: cambiarlo es cambiar de credencial y requiere confirmación por
 *    correo. La pantalla lo muestra en solo lectura.
 */

/** Lo que se acepta. Cualquier otra clave se descarta: `z.object` no es `looseObject`. */
const coachProfileSchema = z.object({
  orgName: z.string().trim().min(1, 'El nombre de la organización no puede estar vacío').max(120),
  coachName: z.string().trim().max(120),
});

export type CoachProfileInput = z.infer<typeof coachProfileSchema>;

export interface CoachProfileResult {
  success: boolean;
  error?: string;
}

/** Perfil tal como está guardado, para rellenar el formulario al abrirlo. */
export interface CoachProfileSnapshot {
  orgName: string;
  coachName: string;
  /** Correo de la cuenta. Informativo: no se edita desde esta pantalla. */
  accountEmail: string;
}

/**
 * Lee el perfil del coach y de su organización.
 *
 * Usa el cliente de SESIÓN a propósito: así RLS garantiza que nadie lee el perfil de otra persona
 * ni el nombre de una organización a la que no pertenece, sin tener que replicar esa comprobación
 * aquí.
 */
export async function getCoachProfile(): Promise<CoachProfileSnapshot | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.org_id) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profile.org_id)
    .maybeSingle();

  return {
    orgName: org?.name ?? '',
    coachName: profile.full_name ?? '',
    accountEmail: user.email ?? '',
  };
}

/**
 * Guarda el nombre de la organización y el del coach.
 *
 * La organización NO viene del cliente: se resuelve del perfil de quien llama. Si viniera en el
 * argumento, quien llamara elegiría a qué organización le cambia el nombre — es el mismo motivo
 * por el que `updateCompanyProfile` tuvo que dejar de aceptar campos arbitrarios.
 *
 * @param input Nombre de la organización y del coach.
 */
export async function updateCoachProfile(input: unknown): Promise<CoachProfileResult> {
  const parsed = coachProfileSchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? 'Datos inválidos',
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: 'No autorizado' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile?.org_id) {
    return { success: false, error: 'No perteneces a ninguna organización' };
  }

  // Cambiar el nombre de la organización lo ven todos sus miembros, así que hace falta rol de
  // administración. El nombre propio no: cada quien puede cambiar el suyo.
  const canRenameOrg = profile.role === 'admin' || profile.role === 'owner';

  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({ full_name: parsed.data.coachName })
    .eq('user_id', user.id);

  if (profileError) {
    console.error('[coach-profile] profile update failed:', profileError.message);
    return { success: false, error: 'No se pudo guardar tu nombre' };
  }

  if (!canRenameOrg) {
    // El nombre propio SÍ se guardó, así que no se reporta un fallo total: se dice exactamente
    // qué no se aplicó. Decir «no autorizado» a secas haría pensar que no se guardó nada.
    return {
      success: false,
      error: 'Tu nombre se guardó. Cambiar el nombre de la organización requiere rol de administración.',
    };
  }

  const { error: orgError } = await supabase
    .from('organizations')
    .update({ name: parsed.data.orgName })
    .eq('id', profile.org_id);

  if (orgError) {
    console.error('[coach-profile] org update failed:', orgError.message);
    return { success: false, error: 'No se pudo guardar el nombre de la organización' };
  }

  return { success: true };
}
