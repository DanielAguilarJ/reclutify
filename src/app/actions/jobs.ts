'use server';

import { createCandidateInvites } from '@/lib/invites/service';
import {
  PUBLIC_JOB_COLUMNS,
  toPublicJobListing,
  toPublicJobListings,
} from '@/lib/jobs/public-projection';
import { createClient } from '@/utils/supabase/server';
import type { JobListing, JobSearchResult, ApplyToJobResult } from '@/types/jobs';

const JOBS_PER_PAGE = 12;

/**
 * Fetches published jobs with optional search, filters, and pagination.
 * No auth required — uses anon RLS policy.
 *
 * Lo que devuelve viaja al cliente en el payload de `/career-fair`, así que pasa
 * por la proyección pública compartida (`src/lib/jobs/public-projection.ts`) y no
 * lleva la rúbrica de los criterios de evaluación.
 */
export async function getPublishedJobs(params: {
  search?: string;
  location?: string;
  job_type?: string;
  page?: number;
  perPage?: number;
}): Promise<JobSearchResult> {
  const supabase = await createClient();
  const page = params.page || 1;
  const perPage = params.perPage || JOBS_PER_PAGE;
  const offset = (page - 1) * perPage;

  let query = supabase
    .from('roles')
    .select(PUBLIC_JOB_COLUMNS, { count: 'exact' })
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + perPage - 1);

  // Full-text search
  if (params.search?.trim()) {
    const searchTerms = params.search.trim().split(/\s+/).join(' & ');
    query = query.or(`search_vector.fts(spanish).${searchTerms},search_vector.fts(english).${searchTerms}`);
  }

  // Location filter
  if (params.location?.trim()) {
    query = query.ilike('location', `%${params.location.trim()}%`);
  }

  // Job type filter
  if (params.job_type?.trim()) {
    query = query.ilike('job_type', `%${params.job_type.trim()}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching published jobs:', error);
    }
    return { jobs: [], total: 0, hasMore: false };
  }

  const jobs = toPublicJobListings(data);
  const total = count || 0;

  return {
    jobs,
    total,
    hasMore: offset + perPage < total,
  };
}

/**
 * Fetches a single published job by ID. Returns null if not found or unpublished.
 * No auth required.
 *
 * Alimenta el HTML y el payload de `/career-fair/[roleId]`, que se sirve sin
 * sesión: misma proyección pública que el listado, sin rúbrica.
 */
export async function getJobById(roleId: string): Promise<JobListing | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('roles')
    .select(PUBLIC_JOB_COLUMNS)
    .eq('id', roleId)
    .eq('is_published', true)
    .single();

  if (error || !data) {
    return null;
  }

  return toPublicJobListing(data);
}

/**
 * Applies a candidate to a job: creates candidate record + interview invite.
 * Checks for duplicate applications (same email + role_id).
 */
export async function applyToJob(data: {
  roleId: string;
  orgId: string;
  name: string;
  email: string;
  phone?: string;
}): Promise<ApplyToJobResult> {
  try {
    const supabase = await createClient();

    // Check for duplicate application (same email + role)
    const { data: existing } = await supabase
      .from('candidates')
      .select('id')
      .eq('email', data.email.toLowerCase().trim())
      .eq('role_id', data.roleId)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        error: 'Ya has aplicado a esta vacante. Revisa tu correo para el enlace de entrevista.',
      };
    }

    // Insert candidate record
    const { error: insertError } = await supabase
      .from('candidates')
      .insert({
        org_id: data.orgId,
        role_id: data.roleId,
        name: data.name.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone?.trim() || null,
        source: 'career-fair',
      });

    if (insertError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error inserting candidate:', insertError);
      }
      return { success: false, error: 'Error al procesar tu aplicación. Intenta de nuevo.' };
    }

    // Get the role title for the invite
    const { data: roleData } = await supabase
      .from('roles')
      .select('title')
      .eq('id', data.roleId)
      .single();

    const roleTitle = roleData?.title || 'Vacante';

    const candidateId = data.email.toLowerCase().trim();

    // Crear la invitación llamando al módulo compartido del servidor.
    //
    // Antes esto era un `fetch` a `/api/invite-candidates`. Un server action ya
    // corre en el servidor, así que el salto por HTTP contra nuestro propio
    // backend no aportaba nada — y no tenía ninguna credencial que presentar,
    // que es la razón por la que el endpoint no podía exigir ninguna. Con la
    // llamada directa, la ruta ya puede exigir sesión y pertenencia a la
    // organización sin romper la postulación pública, que sigue entrando por el
    // módulo compartido.
    //
    // Sigue sin bloquear: si la invitación falla, la postulación ya está
    // registrada y se responde con éxito, igual que antes.
    //
    // EL ENLACE DE ENTREVISTA SALE DE AQUÍ Y SOLO DE AQUÍ
    // ---------------------------------------------------
    // Este action devolvía una URL que construía él mismo, con el formato
    // heredado `/interview?candidateId=...&roleId=...`. Ese formato no existe
    // como ruta: `/interview` no tiene `page.tsx`, y `/interview/[roleId]`
    // muestra siempre "Acceso Restringido" porque la entrevista solo se abre
    // con un token. Es decir, quien se postulaba recibía un enlace muerto
    // mientras el enlace bueno —`/interview/t/{token}`, respaldado por la fila
    // de `interview_tickets`— se descartaba junto con el valor de retorno del
    // servicio. Ahora se usa el `interviewLink` que devuelve el servicio: el
    // mismo que queda en `candidate_invites.interview_link` y que consumen el
    // panel y la automatización de correo.
    //
    // De paso desaparece de este archivo el `NEXT_PUBLIC_APP_URL ||
    // 'https://www.reclutify.com'`: la URL base ya la resuelve una sola vez el
    // servicio con `resolveAppBaseUrl()` (`src/lib/app-url.ts`), así que el
    // proyecto deja de tener dos dominios de reserva distintos.
    //
    // El único caso en que no hay enlace es el fallo de la invitación. Ahí se
    // devuelve `undefined` y no una URL de reserva: `ApplyForm` solo pinta el
    // botón "Iniciar Entrevista con IA" cuando `interviewUrl` viene con valor
    // (`src/components/jobs/ApplyForm.tsx`), así que el candidato ve la
    // confirmación de que su postulación se registró y ningún botón que lleve a
    // una pantalla de error. Su postulación existe y el reclutador puede
    // reenviarle la invitación desde el panel.
    let interviewUrl: string | undefined;

    try {
      const invites = await createCandidateInvites({
        roleId: data.roleId,
        roleTitle,
        candidates: [{ email: candidateId, name: data.name.trim() }],
        language: 'es',
      });

      // `inserted` es el contrato del servicio para "el ticket y su espejo se
      // escribieron sin error". Se exige antes de entregar el enlace porque un
      // `/interview/t/{token}` sin ticket detrás lleva a la pantalla de ticket
      // inválido: otro enlace muerto, que es justo lo que se está arreglando.
      const invite = invites[0];
      if (invite?.inserted) {
        interviewUrl = invite.interviewLink;
      }
    } catch (inviteErr) {
      // Non-blocking — invite record creation failure shouldn't block the application
      if (process.env.NODE_ENV === 'development') {
        console.error('Error creating invite:', inviteErr);
      }
    }

    return { success: true, interviewUrl };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in applyToJob:', err);
    }
    return { success: false, error: 'Error inesperado. Intenta de nuevo.' };
  }
}

/**
 * Toggles the published status of a role. Requires authentication.
 */
export async function toggleRolePublished(
  roleId: string,
  isPublished: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'No autenticado.' };
    }

    // Comprobación explícita de pertenencia, además de la que impone RLS.
    //
    // POR QUÉ NO BASTA CON RLS AQUÍ
    // -----------------------------
    // `org_isolation_roles_update` limita la escritura a la organización del
    // usuario (`00003_sync_data_persistence.sql`), así que no había fuga entre
    // empresas. Pero la política no distingue ROL: cualquier miembro, incluido uno
    // con rol `member`, podía publicar o retirar del portal público la vacante de
    // su organización. Publicar es una acción de cara al exterior y debe exigir
    // permiso de escritura de la organización.
    //
    // Además, sin esta comprobación un `roleId` ajeno producía un `update` que
    // afectaba a cero filas y devolvía `success: true`, así que la interfaz
    // informaba de un cambio que no ocurrió.
    const { data: role, error: roleError } = await supabase
      .from('roles')
      .select('id, org_id')
      .eq('id', roleId)
      .maybeSingle();

    if (roleError) {
      return { success: false, error: 'No se pudo validar la vacante.' };
    }

    if (!role) {
      return { success: false, error: 'Vacante no encontrada.' };
    }

    const { data: membership } = await supabase
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', role.org_id)
      .in('role', ['owner', 'admin'])
      .maybeSingle();

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('user_id', user.id)
      .maybeSingle();

    // Dos fuentes de pertenencia, por el motivo documentado en
    // `src/lib/authz/org-role-authorization.ts`: la fila de `org_members` la crea
    // el onboarding en modo «mejor esfuerzo», así que exigirla en exclusiva
    // devolvería `403` al dueño legítimo cuya fila nunca se insertó.
    const isOrgWriter =
      Boolean(membership) ||
      (profile?.org_id === role.org_id && ['owner', 'admin'].includes(profile?.role ?? ''));

    if (!isOrgWriter) {
      return { success: false, error: 'No tienes permiso para publicar esta vacante.' };
    }

    const updateData: Record<string, unknown> = {
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
    };

    const { error } = await supabase
      .from('roles')
      .update(updateData)
      .eq('id', roleId);

    if (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error toggling role published:', error);
      }
      return { success: false, error: 'Error al actualizar el estado de publicación.' };
    }

    return { success: true };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error in toggleRolePublished:', err);
    }
    return { success: false, error: 'Error inesperado.' };
  }
}

/**
 * Returns distinct location values from published roles for filter dropdowns.
 *
 * No usa `PUBLIC_JOB_COLUMNS` a propósito: solo necesita `location` para armar el
 * desplegable de filtros, así que pide esa columna y nada más.
 */
export async function getDistinctLocations(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('roles')
    .select('location')
    .eq('is_published', true)
    .not('location', 'is', null)
    .not('location', 'eq', '');

  if (error || !data) {
    return [];
  }

  // Extract unique locations
  const locations = [...new Set(
    data
      .map((r: { location: string | null }) => r.location)
      .filter((l): l is string => !!l)
  )];

  return locations.sort();
}
