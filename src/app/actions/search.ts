'use server';
import { createClient } from '@/utils/supabase/server';

export async function searchProfiles(query: string, filters?: { location?: string; skills?: string[] }) {
  const supabase = await createClient();
  let q = supabase.from('profiles').select('user_id, username, full_name, headline, avatar_url, location, skills, is_open_to_work, connections_count');
  if (query) q = q.or(`full_name.ilike.%${query}%,headline.ilike.%${query}%,username.ilike.%${query}%,bio.ilike.%${query}%`);
  if (filters?.location) q = q.ilike('location', `%${filters.location}%`);
  if (filters?.skills && filters.skills.length > 0) q = q.overlaps('skills', filters.skills);
  const { data, error } = await q.limit(20);
  if (error) return { profiles: [], error: error.message };
  return { profiles: data || [] };
}

export async function searchJobs(query: string, filters?: { location?: string; jobType?: string }) {
  const supabase = await createClient();
  let q = supabase.from('roles').select('id, title, description, location, salary, job_type, interview_duration, created_at, org_id')
    .eq('is_published', true);
  if (query) q = q.or(`title.ilike.%${query}%,description.ilike.%${query}%,location.ilike.%${query}%`);
  if (filters?.location) q = q.ilike('location', `%${filters.location}%`);
  if (filters?.jobType) q = q.eq('job_type', filters.jobType);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);
  if (error) return { jobs: [], error: error.message };
  return { jobs: data || [] };
}

export async function getPeopleSuggestions() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { suggestions: [] };
  
  // Get current user's profile for matching
  const { data: myProfile } = await supabase.from('profiles').select('skills, location').eq('user_id', user.id).single();
  
  // Get profiles excluding self and existing connections
  const { data: connections } = await supabase.from('connections')
    .select('requester_id, addressee_id')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  
  const connectedIds = new Set<string>([user.id]);
  connections?.forEach((c: any) => { connectedIds.add(c.requester_id); connectedIds.add(c.addressee_id); });
  
  let q = supabase.from('profiles').select('user_id, username, full_name, headline, avatar_url, location, skills, is_open_to_work')
    .not('user_id', 'in', `(${Array.from(connectedIds).join(',')})`)
    .limit(10);
  
  if (myProfile?.location) q = q.order('location', { ascending: true });
  
  const { data } = await q;
  return { suggestions: data || [] };
}
