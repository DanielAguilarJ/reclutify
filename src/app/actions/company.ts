'use server';
import { createClient } from '@/utils/supabase/server';

export async function getCompanyBySlug(slug: string) {
  const supabase = await createClient();
  const { data: org } = await supabase.from('organizations').select('*').eq('slug', slug).single();
  if (!org) return null;
  // Get published jobs count
  const { count } = await supabase.from('roles').select('*', { count: 'exact', head: true })
    .eq('org_id', org.id).eq('is_published', true);
  // Get published jobs
  const { data: jobs } = await supabase.from('roles').select('id, title, location, salary, job_type, created_at')
    .eq('org_id', org.id).eq('is_published', true).order('created_at', { ascending: false }).limit(10);
  return { ...org, jobCount: count || 0, jobs: jobs || [] };
}

export async function updateCompanyProfile(orgId: string, updates: {
  description?: string; industry?: string; company_size?: string; website?: string;
  headquarters?: string; founded_year?: number; social_links?: Record<string, string>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  // Verify user is admin/owner of this org
  const { data: membership } = await supabase.from('org_members').select('role')
    .eq('user_id', user.id).eq('org_id', orgId).in('role', ['owner', 'admin']).single();
  if (!membership) return { success: false, error: 'Not authorized' };
  const { error } = await supabase.from('organizations').update(updates).eq('id', orgId);
  return { success: !error };
}

export async function getAllCompanies() {
  const supabase = await createClient();
  const { data } = await supabase.from('organizations').select('id, name, slug, logo_url, industry, company_size, description, followers_count')
    .order('followers_count', { ascending: false }).limit(50);
  return { companies: data || [] };
}
