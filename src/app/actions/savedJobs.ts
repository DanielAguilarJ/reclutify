'use server';
import { createClient } from '@/utils/supabase/server';

export async function saveJob(roleId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase.from('saved_jobs').insert({ user_id: user.id, role_id: roleId });
  if (error?.code === '23505') return { success: true, alreadySaved: true };
  return { success: !error };
}

export async function unsaveJob(roleId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('saved_jobs').delete().eq('user_id', user.id).eq('role_id', roleId);
  return { success: true };
}

export async function getSavedJobs() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { jobs: [] };
  const { data } = await supabase.from('saved_jobs').select('role_id, created_at').eq('user_id', user.id).order('created_at', { ascending: false });
  if (!data || data.length === 0) return { jobs: [] };
  const roleIds = data.map((s: any) => s.role_id);
  const { data: roles } = await supabase.from('roles').select('id, title, location, salary, job_type, created_at').in('id', roleIds);
  return { jobs: roles || [] };
}

export async function isJobSaved(roleId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('saved_jobs').select('id').eq('user_id', user.id).eq('role_id', roleId).single();
  return !!data;
}

export async function getMyApplications() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { applications: [] };
  const { data } = await supabase.from('job_applications').select('*').eq('user_id', user.id).order('applied_at', { ascending: false });
  return { applications: data || [] };
}

export async function createApplication(roleId: string, roleTitle: string, orgId?: string, orgName?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase.from('job_applications').insert({
    user_id: user.id, role_id: roleId, role_title: roleTitle, org_id: orgId, org_name: orgName
  });
  return { success: !error };
}
