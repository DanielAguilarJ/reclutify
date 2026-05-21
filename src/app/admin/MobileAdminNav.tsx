'use client';

import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import Logo from '@/components/ui/Logo';

interface MobileAdminNavProps {
  companyName: string | undefined;
  children: React.ReactNode;
}

/**
 * Client component that wraps the admin sidebar for mobile responsiveness.
 * On mobile: renders a hamburger button + slide-out drawer overlay.
 * On desktop (md+): renders children directly (no wrapper needed, handled by parent).
 */
export default function MobileAdminNav({ companyName, children }: MobileAdminNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Close drawer on route change (when user clicks a nav link)
  useEffect(() => {
    const handleRouteChange = () => setIsOpen(false);
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Mobile top bar - only visible on mobile */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center px-4 gap-3">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 rounded-lg text-muted hover:text-foreground hover:bg-background transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Logo size="small" companyName={companyName} />
      </div>

      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-in fade-in"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-out drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 h-full w-[264px] bg-card border-r border-border flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Close button */}
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-background transition-colors"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sidebar content passed as children */}
        <div className="flex flex-col h-full overflow-y-auto" onClick={(e) => {
          // Close drawer when a link is clicked
          const target = e.target as HTMLElement;
          if (target.closest('a') || target.closest('button[type="submit"]')) {
            setTimeout(() => setIsOpen(false), 150);
          }
        }}>
          {children}
        </div>
      </aside>
    </>
  );
}
