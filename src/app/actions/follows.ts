'use server';
import { createClient } from '@/utils/supabase/server';

export async function followUser(followingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  if (user.id === followingId) return { success: false, error: 'Cannot follow yourself' };
  const { error } = await supabase.from('follows').insert({ follower_id: user.id, following_id: followingId });
  if (error?.code === '23505') return { success: true, already: true };
  return { success: !error };
}

export async function unfollowUser(followingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('follows').delete().eq('follower_id', user.id).eq('following_id', followingId);
  return { success: true };
}

export async function getFollowStatus(targetId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { isFollowing: false, isFollowedBy: false };
  const { data: following } = await supabase.from('follows').select('id').eq('follower_id', user.id).eq('following_id', targetId).single();
  const { data: followedBy } = await supabase.from('follows').select('id').eq('follower_id', targetId).eq('following_id', user.id).single();
  return { isFollowing: !!following, isFollowedBy: !!followedBy };
}

export async function getFollowers(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('follows').select('follower_id, created_at').eq('following_id', userId);
  if (!data || data.length === 0) return { followers: [] };
  const ids = data.map((f: any) => f.follower_id);
  const { data: profiles } = await supabase.from('profiles').select('user_id, username, full_name, headline, avatar_url').in('user_id', ids);
  return { followers: profiles || [] };
}

export async function getFollowing(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('follows').select('following_id, created_at').eq('follower_id', userId);
  if (!data || data.length === 0) return { following: [] };
  const ids = data.map((f: any) => f.following_id);
  const { data: profiles } = await supabase.from('profiles').select('user_id, username, full_name, headline, avatar_url').in('user_id', ids);
  return { following: profiles || [] };
}
