'use server';

import { createClient } from '@/utils/supabase/server';
import type { JobListing, JobSearchResult, ApplyToJobResult } from '@/types/jobs';

const JOBS_PER_PAGE = 12;

/**
 * Fetches published jobs with optional search, filters, and pagination.
 * No auth required — uses anon RLS policy.
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
    .select('id, org_id, title, description, location, salary, job_type, topics, published_at, organizations(name, slug, logo_url)', { count: 'exact' })
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

  const jobs = (data || []) as unknown as JobListing[];
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
 */
export async function getJobById(roleId: string): Promise<JobListing | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('roles')
    .select('id, org_id, title, description, location, salary, job_type, topics, published_at, organizations(name, slug, logo_url)')
    .eq('id', roleId)
    .eq('is_published', true)
    .single();

  if (error || !data) {
    return null;
  }

  return data as unknown as JobListing;
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

    // Create interview invite via internal API call
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.reclutify.com';
    const candidateId = data.email.toLowerCase().trim();
    const interviewUrl = `${baseUrl}/interview?candidateId=${encodeURIComponent(candidateId)}&roleId=${encodeURIComponent(data.roleId)}`;

    // Call invite-candidates endpoint internally
    try {
      await fetch(`${baseUrl}/api/invite-candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleId: data.roleId,
          roleTitle,
          candidates: [{ email: data.email.toLowerCase().trim(), name: data.name.trim() }],
          language: 'es',
        }),
      });
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
