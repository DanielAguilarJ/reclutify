import { redirect } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { PlusCircle, Users, Settings, Ticket, LogOut } from 'lucide-react';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { createClient } from '@/utils/supabase/server';
import AdminSidebarNav from './AdminSidebarNav';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();

  if (!session || error) {
    redirect('/login');
  }

  const companyName = session.user.user_metadata?.company_name;
  const userName = session.user.user_metadata?.full_name || 'Admin';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border/50 flex flex-col">
        <div className="p-5 border-b border-border/30">
          <Logo size="small" companyName={companyName} />
          <p className="text-xs text-muted mt-1 uppercase tracking-wider font-semibold">
            {companyName || 'Recruiter'} Dashboard
          </p>
        </div>

        {/* Extracted client-side navigation logic */}
        <nav className="flex-1 p-3">
           <AdminSidebarNav />
        </nav>

        <div className="p-3 border-t border-border/30 flex flex-col gap-2">
          <LanguageToggle />
          <Link
            href="/admin/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted
              hover:text-foreground hover:bg-background transition-all"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>

          
          <form action="/auth/signout" method="post">
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500/80
              hover:text-red-500 hover:bg-red-500/10 transition-all">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>

          <div className="flex items-center gap-3 px-3 py-2.5 mt-1 border-t border-border/30 pt-4">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-medium text-white">
                {userName.split(' ').map((n: string) => n[0]).join('')}
              </span>
            </div>
            <div className="truncate">
              <p className="text-xs font-medium text-foreground">{userName}</p>
              <p className="text-xs text-muted truncate max-w-[140px]">{session.user.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
