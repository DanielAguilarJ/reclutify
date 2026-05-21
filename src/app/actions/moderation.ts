'use server';
import { createClient } from '@/utils/supabase/server';

export async function blockUser(blockedId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  if (user.id === blockedId) return { success: false, error: 'Cannot block yourself' };
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: blockedId });
  if (error?.code === '23505') return { success: true, alreadyBlocked: true };
  // Also remove connection if exists
  await supabase.from('connections').delete().or(`and(requester_id.eq.${user.id},addressee_id.eq.${blockedId}),and(requester_id.eq.${blockedId},addressee_id.eq.${user.id})`);
  return { success: !error };
}

export async function unblockUser(blockedId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId);
  return { success: true };
}

export async function getBlockedUsers() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { blocked: [] };
  const { data } = await supabase.from('user_blocks').select('blocked_id, created_at').eq('blocker_id', user.id);
  if (!data || data.length === 0) return { blocked: [] };
  const ids = data.map((b: any) => b.blocked_id);
  const { data: profiles } = await supabase.from('profiles').select('user_id, username, full_name, avatar_url').in('user_id', ids);
  return { blocked: profiles || [] };
}

export async function reportContent(contentType: string, contentId: string, reason: string, description?: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase.from('reports').insert({
    reporter_id: user.id, content_type: contentType, content_id: contentId, reason, description
  });
  return { success: !error };
}

export async function isUserBlocked(targetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('user_blocks').select('id')
    .or(`and(blocker_id.eq.${user.id},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${user.id})`).limit(1);
  return (data?.length || 0) > 0;
}
