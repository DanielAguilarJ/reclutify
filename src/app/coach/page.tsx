'use client';

import { useEffect } from 'react';
import { useCoachStore } from '@/store/coachStore';
import { useAppStore } from '@/store/appStore';
import { Radio, Users, BookOpen, TrendingUp, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function CoachDashboard() {
  const { language } = useAppStore();
  const { 
    courses, 
    activeSessions, 
    leads, 
    notifications,
    fetchFromSupabase, 
    fetchActiveSessions, 
    fetchLeads,
    fetchNotifications,
    markSessionAttended,
  } = useCoachStore();

  useEffect(() => {
    fetchFromSupabase();
    fetchActiveSessions();
    fetchLeads();
    fetchNotifications();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeCourses = courses.filter(c => c.isActive);
  const totalLeads = leads.length;
  const convertedLeads = leads.filter(l => l.conversionResult === 'converted').length;
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const unreadNotifications = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {language === 'es' ? 'Dashboard de Coach' : 'Coach Dashboard'}
        </h1>
        <p className="text-sm text-muted mt-1">
          {language === 'es' 
            ? 'Gestiona tus cursos y monitorea sesiones de informes en tiempo real.' 
            : 'Manage your courses and monitor information sessions in real-time.'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label={language === 'es' ? 'Cursos Activos' : 'Active Courses'}
          value={activeCourses.length}
          icon={<BookOpen className="h-5 w-5" />}
          color="text-[#D3FB52]"
          bgColor="bg-[#D3FB52]/10"
        />
        <StatCard
          label={language === 'es' ? 'Sesiones en Vivo' : 'Live Sessions'}
          value={activeSessions.length}
          icon={<Radio className="h-5 w-5 animate-pulse" />}
          color="text-green-500"
          bgColor="bg-green-500/10"
        />
        <StatCard
          label={language === 'es' ? 'Prospectos Totales' : 'Total Leads'}
          value={totalLeads}
          icon={<Users className="h-5 w-5" />}
          color="text-blue-500"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          label={language === 'es' ? 'Tasa de Conversion' : 'Conversion Rate'}
          value={`${conversionRate}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          color="text-purple-500"
          bgColor="bg-purple-500/10"
        />
      </div>

      {/* Notifications Alert */}
      {unreadNotifications > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {unreadNotifications} {language === 'es' ? 'notificaciones sin leer' : 'unread notifications'}
            </p>
            <p className="text-xs text-muted mt-0.5">
              {language === 'es' ? 'Tienes clientes esperando atencion' : 'You have clients waiting for attention'}
            </p>
          </div>
          <Link
            href="/coach/notifications"
            className="text-sm font-medium text-orange-500 hover:text-orange-400 flex items-center gap-1"
          >
            Ver <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}

      {/* Active Sessions - Real Time */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Radio className="h-4 w-4 text-green-500 animate-pulse" />
            {language === 'es' ? 'Sesiones en Vivo' : 'Live Sessions'}
          </h2>
        </div>

        {activeSessions.length === 0 ? (
          <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
            <Radio className="h-8 w-8 text-muted mx-auto mb-3" />
            <p className="text-sm text-muted">
              {language === 'es' 
                ? 'No hay sesiones activas en este momento. Cuando un cliente inicie una sesion, aparecera aqui en tiempo real.'
                : 'No active sessions right now. When a client starts a session, it will appear here in real-time.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSessions.map((session) => (
              <div key={session.id} className="bg-card border border-green-500/20 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-500">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    En vivo
                  </span>
                  <span className="text-xs text-muted">
                    {Math.floor((Date.now() - session.createdAt) / 60000)} min
                  </span>
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">
                  {session.clientName || 'Cliente sin nombre'}
                </p>
                <p className="text-xs text-muted mb-3">
                  {session.clientOccupation && `${session.clientOccupation} · `}
                  {session.courseFor && `Para: ${session.courseFor}`}
                </p>
                {session.status === 'closed_presential' && !session.coachNotified && (
                  <button
                    onClick={() => markSessionAttended(session.id)}
                    className="w-full bg-[#D3FB52] hover:bg-[#c4ec43] text-black text-xs font-medium py-2 rounded-xl transition-colors"
                  >
                    Marcar como Atendido
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/coach/create-course"
          className="bg-card border border-border/50 hover:border-[#D3FB52]/30 rounded-2xl p-6 transition-all group"
        >
          <BookOpen className="h-6 w-6 text-[#D3FB52] mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {language === 'es' ? 'Crear Nuevo Curso' : 'Create New Course'}
          </h3>
          <p className="text-xs text-muted">
            {language === 'es' 
              ? 'Configura un curso o producto para que la IA informe a tus clientes'
              : 'Set up a course or product for AI to inform your clients'}
          </p>
        </Link>
        <Link
          href="/coach/leads"
          className="bg-card border border-border/50 hover:border-blue-500/30 rounded-2xl p-6 transition-all group"
        >
          <Users className="h-6 w-6 text-blue-500 mb-3 group-hover:scale-110 transition-transform" />
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {language === 'es' ? 'Ver Prospectos' : 'View Leads'}
          </h3>
          <p className="text-xs text-muted">
            {language === 'es'
              ? 'Revisa los datos de clientes que mostraron interes en tus cursos'
              : 'Review data from clients who showed interest in your courses'}
          </p>
        </Link>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, bgColor }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-5">
      <div className={`w-10 h-10 ${bgColor} rounded-xl flex items-center justify-center mb-3 ${color}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}
