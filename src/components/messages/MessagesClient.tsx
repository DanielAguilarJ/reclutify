'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getConversations, getMessages, sendMessage } from '@/app/actions/messaging';
import { createClient } from '@/utils/supabase/client';
import type { Conversation, Message } from '@/types/messaging';

interface MessagesClientProps {
  userId: string;
  initialConversationId?: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

export default function MessagesClient({ userId, initialConversationId }: MessagesClientProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConversationId || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations
  useEffect(() => {
    getConversations().then((data) => {
      setConversations(data);
      if (!activeConvId && data.length > 0) setActiveConvId(data[0].id);
      setLoading(false);
    });
  }, [activeConvId]);

  // Load messages when active conversation changes
  useEffect(() => {
    if (!activeConvId) return;
    getMessages(activeConvId).then(setMessages);
  }, [activeConvId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    if (!activeConvId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages-${activeConvId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConvId}`,
      }, (payload) => {
        const newMsg = payload.new as unknown as Message;
        newMsg.is_own = newMsg.sender_id === userId;
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConvId, userId]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeConvId || sending) return;
    setSending(true);
    const content = input.trim();
    setInput('');

    // Optimistic
    const optimistic: Message = {
      id: crypto.randomUUID(),
      conversation_id: activeConvId,
      sender_id: userId,
      content,
      read_at: null,
      created_at: new Date().toISOString(),
      is_own: true,
    };
    setMessages(prev => [...prev, optimistic]);

    await sendMessage({ conversation_id: activeConvId, content });
    setSending(false);
  }, [input, activeConvId, sending, userId]);

  const activeConv = conversations.find(c => c.id === activeConvId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="w-8 h-8 border-2 border-neutral-20 border-t-blue-50 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <div className="w-80 border-r border-neutral-10 bg-white flex flex-col">
        <div className="p-4 border-b border-neutral-10">
          <h2 className="font-bold text-neutral-80">Mensajes</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-40">
              No tienes conversaciones aún
            </div>
          ) : (
            conversations.map(conv => (
              <button key={conv.id} onClick={() => setActiveConvId(conv.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-10/50 transition-colors text-left
                  ${activeConvId === conv.id ? 'bg-blue-10/30 border-r-2 border-blue-50' : ''}`}>
                <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-20 shrink-0">
                  {conv.other_participant?.avatar_url ? (
                    <img src={conv.other_participant.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-sm font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                      {(conv.other_participant?.full_name || '?').charAt(0)}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-neutral-80 truncate">
                    {conv.other_participant?.full_name || 'Usuario'}
                  </p>
                  {conv.last_message && (
                    <p className="text-xs text-neutral-40 truncate">
                      {conv.last_message.is_own ? 'Tú: ' : ''}{conv.last_message.content}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-neutral-10/30">
        {activeConv ? (
          <>
            {/* Chat header */}
            <div className="h-16 bg-white border-b border-neutral-10 flex items-center px-5 gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-neutral-20">
                {activeConv.other_participant?.avatar_url ? (
                  <img src={activeConv.other_participant.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                    {(activeConv.other_participant?.full_name || '?').charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <a href={activeConv.other_participant ? `/profile/${activeConv.other_participant.username}` : '#'}
                  className="font-semibold text-neutral-80 hover:text-blue-50 transition-colors text-sm">
                  {activeConv.other_participant?.full_name || 'Usuario'}
                </a>
                {activeConv.other_participant?.headline && (
                  <p className="text-xs text-neutral-40 truncate max-w-[300px]">{activeConv.other_participant.headline}</p>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.is_own ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm
                    ${msg.is_own
                      ? 'bg-blue-50 text-white rounded-br-md'
                      : 'bg-white text-neutral-70 border border-neutral-10 rounded-bl-md shadow-sm'
                    }`}>
                    <p className="whitespace-pre-line">{msg.content}</p>
                    <p className={`text-[10px] mt-1 ${msg.is_own ? 'text-blue-20' : 'text-neutral-30'}`}>
                      {formatTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 bg-white border-t border-neutral-10">
              <div className="flex gap-2">
                <input type="text" value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-20 bg-neutral-10/30 text-sm text-neutral-80 placeholder-neutral-30 focus:outline-none focus:ring-2 focus:ring-blue-50/20 focus:border-blue-50 transition-all" />
                <button onClick={handleSend} disabled={!input.trim() || sending}
                  className="px-4 py-2.5 rounded-xl bg-blue-50 text-white text-sm font-semibold hover:bg-blue-40 disabled:opacity-40 transition-all">
                  Enviar
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-neutral-30 text-sm">Selecciona una conversación</p>
          </div>
        )}
      </div>
    </div>
  );
}
