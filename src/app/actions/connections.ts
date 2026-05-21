'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ConnectionWithProfile, ConnectionStatus } from '@/types/connections';

// ─── Get connection status between current user and another user ───

export async function getConnectionStatus(
  targetUserId: string
): Promise<{ status: ConnectionStatus | 'none'; connectionId?: string; isRequester?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'none' };

  const { data } = await supabase
    .from('connections')
    .select('id, status, requester_id')
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`)
    .maybeSingle();

  if (!data) return { status: 'none' };

  return {
    status: data.status as ConnectionStatus,
    connectionId: data.id,
    isRequester: data.requester_id === user.id,
  };
}

// ─── Send connection request ───

export async function sendConnectionRequest(
  addresseeId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };
  if (user.id === addresseeId) return { success: false, error: 'No puedes conectarte contigo mismo' };

  // Check existing connection
  const existing = await getConnectionStatus(addresseeId);
  if (existing.status !== 'none') {
    return { success: false, error: 'Ya existe una solicitud de conexión' };
  }

  const { error } = await supabase
    .from('connections')
    .insert({ requester_id: user.id, addressee_id: addresseeId });

  if (error) return { success: false, error: error.message };

  revalidatePath('/network');
  return { success: true };
}

// ─── Accept connection request ───

export async function acceptConnectionRequest(
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { error } = await supabase
    .from('connections')
    .update({ status: 'accepted' })
    .eq('id', connectionId)
    .eq('addressee_id', user.id); // RLS + explicit check

  if (error) return { success: false, error: error.message };

  revalidatePath('/network');
  return { success: true };
}

// ─── Decline connection request ───

export async function declineConnectionRequest(
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { error } = await supabase
    .from('connections')
    .update({ status: 'declined' })
    .eq('id', connectionId)
    .eq('addressee_id', user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/network');
  return { success: true };
}

// ─── Remove connection ───

export async function removeConnection(
  connectionId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const { error } = await supabase
    .from('connections')
    .delete()
    .eq('id', connectionId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/network');
  return { success: true };
}

// ─── Get pending requests (received) ───

export async function getPendingRequests(): Promise<ConnectionWithProfile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: connections } = await supabase
    .from('connections')
    .select('*')
    .eq('addressee_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (!connections || connections.length === 0) return [];

  // Get requester profiles
  const requesterIds = connections.map(c => c.requester_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, full_name, headline, avatar_url, is_open_to_work')
    .in('user_id', requesterIds);

  const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

  return connections.map(conn => ({
    ...conn,
    profile: profileMap.get(conn.requester_id) || {
      user_id: conn.requester_id, username: '', full_name: 'Usuario',
      headline: null, avatar_url: null, is_open_to_work: false,
    },
  })) as ConnectionWithProfile[];
}

// ─── Get accepted connections ───

export async function getMyConnections(): Promise<ConnectionWithProfile[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: connections } = await supabase
    .from('connections')
    .select('*')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .order('updated_at', { ascending: false });

  if (!connections || connections.length === 0) return [];

  // Get the "other person" profile for each connection
  const otherUserIds = connections.map(c =>
    c.requester_id === user.id ? c.addressee_id : c.requester_id
  );

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, full_name, headline, avatar_url, is_open_to_work')
    .in('user_id', otherUserIds);

  const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

  return connections.map(conn => {
    const otherId = conn.requester_id === user.id ? conn.addressee_id : conn.requester_id;
    return {
      ...conn,
      profile: profileMap.get(otherId) || {
        user_id: otherId, username: '', full_name: 'Usuario',
        headline: null, avatar_url: null, is_open_to_work: false,
      },
    };
  }) as ConnectionWithProfile[];
}
