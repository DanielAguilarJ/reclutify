'use server';
import { createClient } from '@/utils/supabase/server';

export async function createGroup(data: { name: string; description?: string; privacy?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const { data: group, error } = await supabase.from('groups').insert({
    name: data.name, slug, description: data.description || '', creator_id: user.id, privacy: data.privacy || 'public'
  }).select().single();
  if (error) return { success: false, error: error.message };
  // Add creator as admin
  await supabase.from('group_members').insert({ group_id: group.id, user_id: user.id, role: 'admin' });
  return { success: true, group };
}

export async function getGroups(filter?: 'my' | 'discover') {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (filter === 'my' && user) {
    const { data: memberships } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    if (!memberships || memberships.length === 0) return { groups: [] };
    const ids = memberships.map((m: any) => m.group_id);
    const { data } = await supabase.from('groups').select('*').in('id', ids).order('created_at', { ascending: false });
    return { groups: data || [] };
  }
  const { data } = await supabase.from('groups').select('*').eq('privacy', 'public').order('members_count', { ascending: false }).limit(20);
  return { groups: data || [] };
}

export async function getGroupBySlug(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('groups').select('*').eq('slug', slug).single();
  return data;
}

export async function joinGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase.from('group_members').insert({ group_id: groupId, user_id: user.id });
  return { success: !error };
}

export async function leaveGroup(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
  return { success: true };
}

export async function getGroupPosts(groupId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('group_posts').select('*').eq('group_id', groupId).order('created_at', { ascending: false }).limit(50);
  return { posts: data || [] };
}

export async function createGroupPost(groupId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase.from('group_posts').insert({ group_id: groupId, user_id: user.id, content });
  return { success: !error };
}
