'use server';
import { createClient } from '@/utils/supabase/server';

export async function endorseSkill(endorseeId: string, skill: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };
  if (user.id === endorseeId) return { success: false, error: 'Cannot endorse yourself' };
  
  const { error } = await supabase.from('endorsements').insert({
    endorser_id: user.id, endorsee_id: endorseeId, skill
  });
  if (error?.code === '23505') return { success: false, error: 'Already endorsed' };
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeEndorsement(endorseeId: string, skill: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('endorsements').delete()
    .eq('endorser_id', user.id).eq('endorsee_id', endorseeId).eq('skill', skill);
  return { success: true };
}

export async function getEndorsementsForUser(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('endorsements').select('skill, endorser_id, created_at')
    .eq('endorsee_id', userId);
  // Group by skill
  const grouped: Record<string, { count: number; endorsers: string[] }> = {};
  data?.forEach((e: { skill: string; endorser_id: string; created_at: string }) => {
    if (!grouped[e.skill]) grouped[e.skill] = { count: 0, endorsers: [] };
    grouped[e.skill].count++;
    grouped[e.skill].endorsers.push(e.endorser_id);
  });
  return { endorsements: grouped };
}
