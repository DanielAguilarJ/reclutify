'use client';

import { useEffect } from 'react';
import { useCoachStore } from '@/store/coachStore';
import { useAppStore } from '@/store/appStore';
import { Bell, CheckCheck, UserCheck, AlertTriangle, Radio, Users } from 'lucide-react';

export default function NotificationsPage() {
  const { language } = useAppStore();
  const { notifications, fetchNotifications, markNotificationRead, markAllNotificationsRead } = useCoachStore();

  useEffect(() => {
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const getIcon = (type: string) => {
    switch (type) {
      case 'closing_ready': return <UserCheck className="h-4 w-4 text-green-500" />;
      case 'new_lead': return <Users className="h-4 w-4 text-blue-500" />;
      case 'session_started': return <Radio className="h-4 w-4 text-purple-500" />;
      case 'objection_alert': return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default: return <Bell className="h-4 w-4 text-muted" />;
    }
  };

  const getTypeLabel = (type: string) => {
    if (language === 'es') {
      switch (type) {
        case 'closing_ready': return 'Listo para cerrar';
        case 'new_lead': return 'Nuevo prospecto';
        case 'session_started': return 'Sesion iniciada';
        case 'objection_alert': return 'Objecion detectada';
        default: return 'Notificacion';
      }
    }
    switch (type) {
      case 'closing_ready': return 'Ready to close';
      case 'new_lead': return 'New lead';
      case 'session_started': return 'Session started';
      case 'objection_alert': return 'Objection detected';
      default: return 'Notification';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {language === 'es' ? 'Notificaciones' : 'Notifications'}
          </h1>
          <p className="text-sm text-muted mt-1">
            {unreadCount > 0
              ? `${unreadCount} ${language === 'es' ? 'sin leer' : 'unread'}`
              : (language === 'es' ? 'Todas leidas' : 'All read')}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllNotificationsRead}
            className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            <CheckCheck className="h-4 w-4" />
            {language === 'es' ? 'Marcar todas como leidas' : 'Mark all read'}
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-2xl p-12 text-center">
          <Bell className="h-10 w-10 text-muted mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {language === 'es' ? 'Sin notificaciones' : 'No notifications'}
          </h3>
          <p className="text-sm text-muted max-w-sm mx-auto">
            {language === 'es'
              ? 'Las notificaciones en tiempo real aparecen cuando un cliente necesita atencion.'
              : 'Real-time notifications appear when a client needs attention.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => !notification.read && markNotificationRead(notification.id)}
              className={`w-full text-left bg-card border rounded-xl p-4 transition-all ${
                notification.read
                  ? 'border-border/30 opacity-60'
                  : 'border-[#D3FB52]/20 shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 p-2 rounded-lg ${notification.read ? 'bg-muted/5' : 'bg-background'}`}>
                  {getIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">
                      {getTypeLabel(notification.type)}
                    </span>
                    {!notification.read && (
                      <span className="h-2 w-2 rounded-full bg-[#D3FB52]" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{notification.title}</p>
                  {notification.message && (
                    <p className="text-xs text-muted mt-0.5">{notification.message}</p>
                  )}
                  <p className="text-xs text-muted mt-1.5">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours}h`;
  if (days < 7) return `Hace ${days}d`;
  return new Date(timestamp).toLocaleDateString();
}
