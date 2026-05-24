'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition, useEffect } from 'react';
import { PlusCircle, BookOpen, Users, Bell, PieChart, ChevronDown, Building2, Check, Loader2, Radio } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useCoachStore } from '@/store/coachStore';
import { switchOrganization } from '@/app/actions/organizations';

interface CoachSidebarNavProps {
  organizations: { id: string; name: string }[];
  activeOrgId: string | null;
}

export default function CoachSidebarNav({ organizations, activeOrgId }: CoachSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { language } = useAppStore();
  const { notifications, fetchNotifications, subscribeToRealtime, setOrgId, fetchFromSupabase } = useCoachStore();
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [isPending, startTransition] = useTransition();

  const activeOrg = organizations.find(o => o.id === activeOrgId) || organizations[0] || null;
  const unreadCount = notifications.filter(n => !n.read).length;

  // Initialize store with org data
  useEffect(() => {
    if (activeOrgId) {
      setOrgId(activeOrgId);
      fetchFromSupabase();
      fetchNotifications();
      const unsubscribe = subscribeToRealtime();
      return () => unsubscribe();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrgId]);

  const handleSwitchOrg = (orgId: string) => {
    if (orgId === activeOrgId) {
      setShowOrgDropdown(false);
      return;
    }

    startTransition(async () => {
      const result = await switchOrganization(orgId);
      if (result.success) {
        setShowOrgDropdown(false);
        router.refresh();
      }
    });
  };

  const navItems = [
    { label: language === 'es' ? 'Dashboard' : 'Dashboard', href: '/coach', icon: PieChart },
    { label: language === 'es' ? 'Crear Curso' : 'Create Course', href: '/coach/create-course', icon: PlusCircle },
    { label: language === 'es' ? 'Mis Cursos' : 'My Courses', href: '/coach/courses', icon: BookOpen },
    { label: language === 'es' ? 'Prospectos' : 'Leads', href: '/coach/leads', icon: Users },
    { 
      label: language === 'es' ? 'Notificaciones' : 'Notifications', 
      href: '/coach/notifications', 
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
  ];

  return (
    <div className="space-y-1">
      {/* Workspace Selector */}
      <div className="relative mb-6">
        <button 
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          disabled={isPending}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border/50 rounded-xl hover:border-border transition-all group disabled:opacity-70"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-6 w-6 rounded-md bg-[#D3FB52]/10 text-[#D3FB52] flex items-center justify-center shrink-0">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            </div>
            <span className="text-sm font-semibold text-foreground truncate">
              {activeOrg?.name || (language === 'es' ? 'Sin organizacion' : 'No organization')}
            </span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showOrgDropdown && (
          <div className="absolute top-full left-0 w-full mt-1 bg-card border border-border/50 rounded-xl shadow-xl shadow-black/5 p-1 z-50 animate-in fade-in slide-in-from-top-2">
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => handleSwitchOrg(org.id)}
                className="w-full flex items-center justify-between gap-2 px-2 py-2 hover:bg-background rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-md bg-[#D3FB52]/5 text-[#D3FB52] flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-foreground">{org.name}</span>
                </div>
                {org.id === activeOrgId && <Check className="h-3 w-3 text-[#D3FB52]" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-3 mb-2">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          {language === 'es' ? 'Informes' : 'Reports'}
        </span>
      </div>

      {navItems.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-[#D3FB52]/10 text-[#D3FB52]'
                : 'text-muted hover:text-foreground hover:bg-background'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {'badge' in item && item.badge && (
              <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}

      {/* Live Sessions Indicator */}
      <div className="pt-4 mt-4 border-t border-border/30">
        <div className="px-3 mb-2">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
            <Radio className="h-3 w-3 text-green-500 animate-pulse" />
            {language === 'es' ? 'Sesiones en Vivo' : 'Live Sessions'}
          </span>
        </div>
        <LiveSessionsIndicator />
      </div>
    </div>
  );
}

function LiveSessionsIndicator() {
  const { activeSessions, fetchActiveSessions } = useCoachStore();

  useEffect(() => {
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 30000); // Refresh every 30s as backup
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (activeSessions.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-muted">
        Sin sesiones activas
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activeSessions.slice(0, 3).map((session) => (
        <div key={session.id} className="px-3 py-2 bg-green-500/5 border border-green-500/10 rounded-lg">
          <p className="text-xs font-medium text-foreground truncate">
            {session.clientName || 'Cliente'}
          </p>
          <p className="text-xs text-muted">
            {Math.floor((Date.now() - session.createdAt) / 60000)} min
          </p>
        </div>
      ))}
      {activeSessions.length > 3 && (
        <p className="px-3 text-xs text-muted">+{activeSessions.length - 3} mas</p>
      )}
    </div>
  );
}
