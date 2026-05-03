'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { PlusCircle, Users, Ticket, Headset, Crown, PieChart, ChevronDown, Building2, Check, ShieldAlert, Loader2 } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { switchOrganization } from '@/app/actions/organizations';

/**
 * Props del componente — recibe datos reales desde el Server Component (layout.tsx)
 */
interface AdminSidebarNavProps {
  organizations: { id: string; name: string }[];
  activeOrgId: string | null;
}

export default function AdminSidebarNav({ organizations, activeOrgId }: AdminSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { language, planTier } = useAppStore();
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Determinar la org activa a partir de los datos reales
  const activeOrg = organizations.find(o => o.id === activeOrgId) || organizations[0] || null;

  /**
   * Maneja el cambio de organización activa.
   * Llama al Server Action y refresca la página para cargar los datos de la nueva org.
   */
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
    { label: language === 'es' ? 'Dashboard' : 'Dashboard', href: '/admin', icon: PieChart },
    { label: language === 'es' ? 'Crear Puesto' : 'Create Role', href: '/admin/create-role', icon: PlusCircle },
    { label: language === 'es' ? 'Candidatos' : 'Pipeline', href: '/admin/pipeline', icon: Users },
    { label: language === 'es' ? 'Equidad (Sesgo)' : 'AI Fairness', href: '/admin/analytics/bias', icon: ShieldAlert },
    { label: language === 'es' ? 'Telemetría AI' : 'AI Telemetry', href: '/admin/telemetry', icon: PieChart },
    { label: 'Tickets', href: '/admin/tickets', icon: Ticket },
  ];

  return (
    <div className="space-y-1">
      {/* Workspace Selector — datos reales desde Supabase */}
      <div className="relative mb-6">
        <button 
          onClick={() => setShowOrgDropdown(!showOrgDropdown)}
          disabled={isPending}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-background border border-border/50 rounded-xl hover:border-border transition-all group disabled:opacity-70"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="h-6 w-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            </div>
            <span className="text-sm font-semibold text-foreground truncate">
              {activeOrg?.name || (language === 'es' ? 'Sin organización' : 'No organization')}
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
                  <div className="h-6 w-6 rounded-md bg-primary/5 text-primary flex items-center justify-center shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <span className="text-sm text-foreground">{org.name}</span>
                </div>
                {org.id === activeOrgId && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
            <div className="h-px bg-border/50 my-1 mx-2" />
            <Link href="/onboarding" className="w-full flex items-center gap-2 px-2 py-2 hover:bg-background rounded-lg transition-colors text-sm text-muted hover:text-foreground">
              <PlusCircle className="h-4 w-4" />
              {language === 'es' ? 'Crear Workspace' : 'Create Workspace'}
            </Link>
          </div>
        )}
      </div>

      <div className="px-3 mb-2">
        <span className="text-xs font-semibold text-muted uppercase tracking-wider">
          {language === 'es' ? 'Principal' : 'Main'}
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
                ? 'bg-primary-light text-primary'
                : 'text-muted hover:text-foreground hover:bg-background'
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}

      {/* Priority Support */}
      <div className="pt-4 mt-4 border-t border-border/30">
        <div className="px-3 mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted uppercase tracking-wider">
            {language === 'es' ? 'Soporte VIP' : 'VIP Support'}
          </span>
        </div>
        
        {planTier === 'starter' ? (
          <Link
            href="/admin/settings"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted hover:text-foreground hover:bg-background transition-all group"
            title={language === 'es' ? 'Sube a Pro para habilitar el Soporte VIP' : 'Upgrade to Pro to enable VIP Support'}
          >
            <Headset className="h-4 w-4" />
            <span className="flex-1">{language === 'es' ? 'Soporte Pro' : 'Pro Support'}</span>
            <Crown className="h-3 w-3 opacity-50 group-hover:opacity-100 group-hover:text-[#D3FB52] transition-colors" />
          </Link>
        ) : (
          <a
            href="mailto:support@worldbrain.com"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-foreground bg-[#D3FB52]/10 hover:bg-[#D3FB52]/20 transition-all border border-[#D3FB52]/20"
          >
            <Headset className="h-4 w-4 text-[#D3FB52]" />
            <span className="flex-1">{language === 'es' ? 'Contactar Soporte' : 'Contact Support'}</span>
          </a>
        )}
      </div>
    </div>
  );
}
