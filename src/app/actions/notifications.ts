'use server';
import { createClient } from '@/utils/supabase/server';

export async function getNotifications(limit = 20) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { notifications: [] };
  const { data } = await supabase.from('notifications').select('*')
    .eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
  return { notifications: data || [] };
}

export async function getUnreadCount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;
  const { count } = await supabase.from('notifications').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('read', false);
  return count || 0;
}

export async function markNotificationRead(notificationId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('notifications').update({ read: true }).eq('id', notificationId).eq('user_id', user.id);
  return { success: true };
}

export async function markAllNotificationsRead() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false };
  await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
  return { success: true };
}
