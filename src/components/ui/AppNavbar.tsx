'use client';

import { useState } from 'react';
import { Home, Briefcase, Users, MessageCircle, Menu, X } from 'lucide-react';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';
import LanguageToggle from './LanguageToggle';
import { useAppStore } from '@/store/appStore';

interface NavUser {
  username: string;
  full_name: string;
  avatar_url: string | null;
}

interface AppNavbarProps {
  user?: NavUser | null;
  activeRoute?: string;
}

const NAV_ITEMS = [
  { href: '/feed', icon: Home, labelEn: 'Feed', labelEs: 'Feed' },
  { href: '/network', icon: Users, labelEn: 'Network', labelEs: 'Mi Red' },
  { href: '/messages', icon: MessageCircle, labelEn: 'Messages', labelEs: 'Mensajes' },
  { href: '/career-fair', icon: Briefcase, labelEn: 'Jobs', labelEs: 'Vacantes' },
];

export default function AppNavbar({ user, activeRoute }: AppNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const language = useAppStore((s) => s.language);

  return (
    <>
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-xl border-b border-border transition-colors">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <a href="/feed" className="shrink-0">
            <Logo size="small" />
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeRoute === item.href;
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted hover:bg-surface hover:text-foreground'
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {language === 'es' ? item.labelEs : item.labelEn}
                </a>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />
            
            {user && (
              <a
                href={`/profile/${user.username}`}
                className="hidden md:flex items-center gap-2 pl-2 hover:opacity-80 transition-opacity"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-20 border border-border">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </a>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl 
                bg-surface hover:bg-surface-hover border border-border transition-colors"
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-14 z-40 bg-background/95 backdrop-blur-sm">
          <nav className="flex flex-col p-4 gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeRoute === item.href;
              const Icon = item.icon;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium transition-all
                    ${isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted hover:bg-surface hover:text-foreground'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  {language === 'es' ? item.labelEs : item.labelEn}
                </a>
              );
            })}
            {user && (
              <a
                href={`/profile/${user.username}`}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium text-muted hover:bg-surface hover:text-foreground transition-all mt-2 border-t border-border pt-4"
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-neutral-20 border border-border">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.full_name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs font-bold text-neutral-50 bg-gradient-to-br from-blue-10 to-purple-10">
                      {user.full_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <span>{language === 'es' ? 'Mi Perfil' : 'My Profile'}</span>
              </a>
            )}
          </nav>
        </div>
      )}
    </>
  );
}
