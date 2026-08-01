'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

interface ActionResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Obtiene todos los cursos de la organización activa del coach.
 */
export async function getCoachCourses(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.org_id) return { success: false, error: 'Sin organizacion' };

  const { data, error } = await supabase
    .from('courses')
    .select(`
      *,
      course_modules (id, title, description, order_index),
      course_plans (id, name, price, currency, features, is_recommended, order_index)
    `)
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/**
 * Resuelve la organización del usuario autenticado.
 *
 * Devuelve `null` si no hay sesión o la cuenta no tiene organización. Se usa como
 * puerta de las tres funciones de escritura de abajo, que antes no comprobaban
 * NADA.
 */
async function requireOwnOrgId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return profile?.org_id ?? null;
}

/**
 * Comprueba que un curso pertenece a la organización del usuario autenticado.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * `toggleCourseActive` y `deleteCourse` filtraban SOLO por `courseId`, sin llamar
 * a `getUser()` ni comprobar la organización. La única defensa era RLS, y la tabla
 * `courses` NO TIENE MIGRACIÓN en este repositorio (ver `REPORTE_REFACTOR.md`), así
 * que sus políticas son desconocidas y no se puede afirmar que existan. Una acción
 * destructiva no debe depender de una política que no está en el control de
 * versiones.
 *
 * La comprobación se hace en el servidor y con la organización resuelta desde el
 * perfil del propio usuario, nunca desde el argumento.
 */
async function assertCourseInOwnOrg(courseId: string): Promise<ActionResult | null> {
  const orgId = await requireOwnOrgId();
  if (!orgId) return { success: false, error: 'No autenticado' };

  const supabase = await createClient();

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, org_id')
    .eq('id', courseId)
    .maybeSingle();

  if (error) return { success: false, error: 'No se pudo validar el curso' };

  // Mismo mensaje para «no existe» y «es de otra organización»: distinguirlos
  // permitiría enumerar los cursos de otras empresas por su identificador.
  if (!course || course.org_id !== orgId) {
    return { success: false, error: 'Curso no encontrado' };
  }

  return null;
}

/**
 * Obtiene un curso específico con todos sus datos.
 *
 * Exige sesión y pertenencia: es la vista de edición del asesor, no el catálogo
 * público. Para el catálogo existen `getPublicCourse` y `getPublicCourses`, que
 * filtran por `is_active` a propósito.
 */
export async function getCourseById(courseId: string): Promise<ActionResult> {
  const denied = await assertCourseInOwnOrg(courseId);
  if (denied) return denied;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('courses')
    .select(`
      *,
      course_modules (id, title, description, order_index),
      course_plans (id, name, price, currency, features, is_recommended, order_index)
    `)
    .eq('id', courseId)
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/**
 * Activa o desactiva un curso.
 *
 * Antes no exigía sesión: cualquiera podía desactivar el curso de cualquier
 * empresa —y con él su página pública de informes— con solo su identificador.
 */
export async function toggleCourseActive(courseId: string): Promise<ActionResult> {
  const denied = await assertCourseInOwnOrg(courseId);
  if (denied) return denied;

  const supabase = await createClient();

  const { data: course } = await supabase
    .from('courses')
    .select('is_active')
    .eq('id', courseId)
    .maybeSingle();

  if (!course) return { success: false, error: 'Curso no encontrado' };

  const { error } = await supabase
    .from('courses')
    .update({ is_active: !course.is_active })
    .eq('id', courseId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/coach/courses');
  revalidatePath('/informes');
  return { success: true };
}

/**
 * Elimina un curso y todos sus datos relacionados.
 *
 * Antes no exigía sesión. Es la operación más destructiva del módulo del asesor
 * —borra en cascada módulos, planes y el histórico de sesiones— y era invocable
 * por cualquiera con el identificador del curso.
 */
export async function deleteCourse(courseId: string): Promise<ActionResult> {
  const denied = await assertCourseInOwnOrg(courseId);
  if (denied) return denied;

  const supabase = await createClient();

  const { error } = await supabase
    .from('courses')
    .delete()
    .eq('id', courseId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/coach/courses');
  revalidatePath('/informes');
  return { success: true };
}

/**
 * Obtiene los leads/prospectos de la organización.
 */
export async function getCoachLeads(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', user.id)
    .single();

  if (!profile?.org_id) return { success: false, error: 'Sin organizacion' };

  const { data, error } = await supabase
    .from('info_sessions')
    .select('*, courses(name)')
    .eq('org_id', profile.org_id)
    .in('status', ['closed_remote', 'completed', 'closed_presential'])
    .order('created_at', { ascending: false });

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}

/**
 * Obtiene un curso público por ID (para la sesión de informes).
 */
export async function getPublicCourse(courseId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .eq('is_active', true)
    .single();

  if (courseError || !course) return { success: false, error: 'Curso no encontrado o no disponible' };

  const { data: modules } = await supabase
    .from('course_modules')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  const { data: plans } = await supabase
    .from('course_plans')
    .select('*')
    .eq('course_id', courseId)
    .order('order_index', { ascending: true });

  return { success: true, data: { course, modules: modules || [], plans: plans || [] } };
}

/**
 * Obtiene todos los cursos activos de una organización (catálogo público).
 */
export async function getPublicCourses(orgId?: string): Promise<ActionResult> {
  const supabase = await createClient();

  let query = supabase
    .from('courses')
    .select('id, name, description, target_audience, modality, duration_info, org_id, benefits')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query;

  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
