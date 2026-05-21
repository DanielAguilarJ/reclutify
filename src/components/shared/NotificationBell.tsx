'use client';
import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { useAppStore } from '@/store/appStore';
import Link from 'next/link';

interface Notification {
  id: string; type: string; title: string; body: string | null;
  metadata: Record<string, string>; read: boolean; created_at: string;
}

export function NotificationBell({ userId }: { userId: string }) {
  const { language } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const fetch = async () => {
      const { data } = await supabase.from('notifications').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
      if (data) { setNotifications(data); setUnreadCount(data.filter((n: Notification) => !n.read).length); }
    };
    fetch();
    const channel = supabase.channel('notif-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => { const n = payload.new as Notification; setNotifications(prev => [n, ...prev.slice(0, 19)]); setUnreadCount(prev => prev + 1); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const markAllRead = async () => {
    const supabase = createClient();
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true }))); setUnreadCount(0);
  };

  const icon = (type: string) => {
    const map: Record<string, string> = { connection_request: '🤝', connection_accepted: '✅', post_reaction: '❤️', post_comment: '💬', message: '✉️', profile_view: '👁️', endorsement: '⭐', follow: '👤' };
    return map[type] || '🔔';
  };

  const link = (n: Notification) => {
    if (n.type.startsWith('connection')) return '/network';
    if (n.type.startsWith('post')) return '/feed';
    if (n.type === 'message') return '/messages';
    return '/feed';
  };

  const timeAgo = (d: string) => {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return language === 'es' ? 'ahora' : 'now';
    const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="relative p-2 rounded-lg text-muted hover:text-foreground hover:bg-muted/10 transition-colors">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-[480px] bg-card rounded-xl border border-border shadow-xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
            <h3 className="text-sm font-semibold text-foreground">{language === 'es' ? 'Notificaciones' : 'Notifications'}</h3>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:text-primary-hover font-medium">
                {language === 'es' ? 'Marcar leidas' : 'Mark all read'}
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="py-12 text-center"><Bell className="h-8 w-8 text-muted/30 mx-auto mb-2" /><p className="text-xs text-muted">{language === 'es' ? 'Sin notificaciones' : 'No notifications'}</p></div>
            ) : notifications.map((n) => (
              <Link key={n.id} href={link(n)} onClick={() => setIsOpen(false)}
                className={`flex items-start gap-3 px-4 py-3 hover:bg-muted/5 transition-colors border-b border-border/20 ${!n.read ? 'bg-primary/5' : ''}`}>
                <span className="text-lg mt-0.5">{icon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-relaxed ${!n.read ? 'text-foreground font-medium' : 'text-muted'}`}>{n.title}</p>
                  {n.body && <p className="text-[10px] text-muted mt-0.5 truncate">{n.body}</p>}
                </div>
                <span className="text-[10px] text-muted shrink-0">{timeAgo(n.created_at)}</span>
                {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
