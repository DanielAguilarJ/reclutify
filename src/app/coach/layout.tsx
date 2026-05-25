import { redirect } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { Settings, LogOut } from 'lucide-react';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { createClient } from '@/utils/supabase/server';
import { getUserOrganizations, getActiveOrganizationId } from '@/app/actions/organizations';
import CoachSidebarNav from './CoachSidebarNav';
import MobileCoachNav from './MobileCoachNav';

// Forzar rendering dinámico — el layout necesita auth de Supabase
export const dynamic = 'force-dynamic';

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    redirect('/login');
  }

  // Obtener organizaciones del usuario y la org activa
  const userOrgs = await getUserOrganizations();
  const activeOrgId = await getActiveOrganizationId();

  // Determinar la organización activa
  const activeOrg = userOrgs.find(o => o.id === activeOrgId) || userOrgs[0] || null;

  const companyName = activeOrg?.name || user.user_metadata?.company_name;
  const userName = user.user_metadata?.full_name || 'Coach';

  // Shared sidebar content used in both desktop and mobile
  const sidebarContent = (
    <>
      <div className="p-5 border-b border-border/30">
        <Logo size="small" companyName={companyName} />
        <p className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">
          {companyName || 'Coach'} Dashboard
        </p>
      </div>

      {/* Client-side navigation with real org data */}
      <nav className="flex-1 p-3">
         <CoachSidebarNav
           organizations={userOrgs.map(o => ({ id: o.id, name: o.name }))}
           activeOrgId={activeOrg?.id || null}
         />
      </nav>

      <div className="p-3 border-t border-border/30 flex flex-col gap-2">
        <LanguageToggle />
        <Link
          href="/coach/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted
            hover:text-foreground hover:bg-background transition-all"
        >
          <Settings className="h-4 w-4" />
          Configuracion
        </Link>

        <form action="/auth/signout" method="post">
          <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500/80
            hover:text-red-500 hover:bg-red-500/10 transition-all">
            <LogOut className="h-4 w-4" />
            Cerrar Sesion
          </button>
        </form>

        <div className="flex items-center gap-3 px-3 py-2.5 mt-1 border-t border-border/30 pt-4">
          <div className="h-8 w-8 rounded-full bg-[#D3FB52] flex items-center justify-center">
            <span className="text-xs font-medium text-black">
              {userName.split(' ').map((n: string) => n[0]).join('')}
            </span>
          </div>
          <div className="truncate">
            <p className="text-xs font-medium text-foreground">{userName}</p>
            <p className="text-xs text-muted truncate max-w-[140px]">{user.email}</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile navigation - slide-out drawer with hamburger */}
      <MobileCoachNav companyName={companyName}>
        {sidebarContent}
      </MobileCoachNav>

      {/* Desktop Sidebar - hidden on mobile */}
      <aside className="hidden md:flex w-[264px] shrink-0 bg-card border-r border-border/50 flex-col fixed inset-y-0 left-0 z-30">
        {sidebarContent}
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto md:ml-[264px] pt-14 md:pt-0">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
