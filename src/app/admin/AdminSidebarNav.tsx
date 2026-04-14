'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { PlusCircle, Users, Ticket, Headset, Crown } from 'lucide-react';
import { useAppStore } from '@/store/appStore';

export default function AdminSidebarNav() {
  const pathname = usePathname();
  const { language, planTier } = useAppStore();

  const navItems = [
    { label: language === 'es' ? 'Crear Puesto' : 'Create Role', href: '/admin/create-role', icon: PlusCircle },
    { label: language === 'es' ? 'Candidatos' : 'Pipeline', href: '/admin/pipeline', icon: Users },
    { label: 'Tickets', href: '/admin/tickets', icon: Ticket },
  ];

  return (
    <div className="space-y-1">
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
