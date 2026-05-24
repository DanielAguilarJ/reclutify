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
 * Obtiene un curso específico con todos sus datos.
 */
export async function getCourseById(courseId: string): Promise<ActionResult> {
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
 */
export async function toggleCourseActive(courseId: string): Promise<ActionResult> {
  const supabase = await createClient();

  // Get current state
  const { data: course } = await supabase
    .from('courses')
    .select('is_active')
    .eq('id', courseId)
    .single();

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
 */
export async function deleteCourse(courseId: string): Promise<ActionResult> {
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
