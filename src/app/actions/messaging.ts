'use server';

import { createClient } from '@/utils/supabase/server';
import type { Conversation, Message } from '@/types/messaging';

// ─── Get or create a conversation with a user ───

export async function getOrCreateConversation(
  otherUserId: string
): Promise<{ success: boolean; conversationId?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };
  if (user.id === otherUserId) return { success: false, error: 'No puedes enviarte mensajes a ti mismo' };

  // Check if conversation already exists
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, participant_ids')
    .contains('participant_ids', [user.id])
    .contains('participant_ids', [otherUserId])
    .maybeSingle();

  if (existing) {
    return { success: true, conversationId: existing.id };
  }

  // Create new conversation
  const { data: newConv, error } = await supabase
    .from('conversations')
    .insert({ participant_ids: [user.id, otherUserId] })
    .select('id')
    .single();

  if (error) return { success: false, error: error.message };

  return { success: true, conversationId: newConv.id };
}

// ─── Get user's conversations ───

export async function getConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .contains('participant_ids', [user.id])
    .order('last_message_at', { ascending: false });

  if (!conversations || conversations.length === 0) return [];

  // Get other participants' profiles
  const otherIds = conversations
    .flatMap(c => (c.participant_ids as string[]).filter(id => id !== user.id));
  const uniqueOtherIds = [...new Set(otherIds)];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, username, full_name, avatar_url, headline')
    .in('user_id', uniqueOtherIds);

  const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

  // Get last message for each conversation
  const convIds = conversations.map(c => c.id);
  const { data: lastMessages } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: false });

  // Group last message by conversation
  const lastMsgMap = new Map<string, Message>();
  for (const msg of (lastMessages || [])) {
    if (!lastMsgMap.has(msg.conversation_id)) {
      lastMsgMap.set(msg.conversation_id, msg as unknown as Message);
    }
  }

  return conversations.map(conv => {
    const otherId = (conv.participant_ids as string[]).find(id => id !== user.id) || '';
    const otherProfile = profileMap.get(otherId);
    const lastMsg = lastMsgMap.get(conv.id);

    return {
      ...conv,
      other_participant: otherProfile ? {
        user_id: otherProfile.user_id,
        username: otherProfile.username,
        full_name: otherProfile.full_name,
        avatar_url: otherProfile.avatar_url,
        headline: otherProfile.headline,
      } : undefined,
      last_message: lastMsg ? { ...lastMsg, is_own: lastMsg.sender_id === user.id } : undefined,
    };
  }) as Conversation[];
}

// ─── Get messages for a conversation ───

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(100);

  return ((data || []) as unknown as Message[]).map(msg => ({
    ...msg,
    is_own: msg.sender_id === user.id,
  }));
}

// ─── Send message ───

export async function sendMessage(payload: {
  conversation_id: string;
  content: string;
}): Promise<{ success: boolean; message?: Message; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'No autenticado' };

  const content = payload.content.trim().slice(0, 2000);
  if (!content) return { success: false, error: 'Mensaje vacío' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: payload.conversation_id,
      sender_id: user.id,
      content,
    })
    .select()
    .single();

  if (error) return { success: false, error: error.message };

  return {
    success: true,
    message: { ...(data as unknown as Message), is_own: true },
  };
}
