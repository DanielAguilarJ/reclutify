'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Briefcase, Users, MessageSquare, Bell, Search, Menu, X } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { NotificationBell } from './NotificationBell';
import { GlobalSearchBar } from './GlobalSearchBar';

interface CandidateTopNavProps {
  user: { id: string; email?: string };
  profile?: { username: string; avatar_url?: string; full_name: string } | null;
  unreadMessages?: number;
}

export function CandidateTopNav({ user, profile, unreadMessages = 0 }: CandidateTopNavProps) {
  const pathname = usePathname();
  const { language } = useAppStore();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const navItems = [
    { href: '/feed', icon: Home, label: language === 'es' ? 'Inicio' : 'Home' },
    { href: '/network', icon: Users, label: language === 'es' ? 'Mi Red' : 'Network' },
    { href: '/career-fair', icon: Briefcase, label: language === 'es' ? 'Empleos' : 'Jobs' },
    { href: '/messages', icon: MessageSquare, label: language === 'es' ? 'Mensajes' : 'Messages', badge: unreadMessages },
  ];

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-md border-b border-border/50 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <Link href="/feed" className="flex items-center gap-2 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <span className="text-lg font-bold text-foreground hidden sm:block">Reclutify</span>
        </Link>

        <div className="hidden md:block flex-1 max-w-md">
          <GlobalSearchBar />
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link key={item.href} href={item.href}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors ${isActive ? 'text-primary bg-primary/5' : 'text-muted hover:text-foreground hover:bg-muted/10'}`}>
                <item.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-0.5 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold px-1">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={() => setShowSearch(!showSearch)} className="md:hidden p-2 rounded-lg text-muted hover:text-foreground hover:bg-muted/10">
            <Search className="h-5 w-5" />
          </button>
          <NotificationBell userId={user.id} />
          {profile && (
            <Link href={`/profile/${profile.username}`} className="w-8 h-8 rounded-full overflow-hidden border-2 border-border hover:border-primary transition-colors">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                  {profile.full_name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
              )}
            </Link>
          )}
          <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="md:hidden p-2 rounded-lg text-muted hover:text-foreground hover:bg-muted/10">
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {showSearch && (
        <div className="md:hidden px-4 pb-3 border-t border-border/30"><GlobalSearchBar /></div>
      )}
      {showMobileMenu && (
        <nav className="md:hidden px-4 pb-3 border-t border-border/30 flex flex-col gap-1 pt-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onClick={() => setShowMobileMenu(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive ? 'text-primary bg-primary/5' : 'text-muted hover:text-foreground hover:bg-muted/10'}`}>
                <item.icon className="h-5 w-5" />
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge && item.badge > 0 && (
                  <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-danger text-white text-xs font-bold px-1">{item.badge}</span>
                )}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
