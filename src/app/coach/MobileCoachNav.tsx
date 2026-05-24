'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';

interface MobileCoachNavProps {
  companyName: string | undefined;
  children: React.ReactNode;
}

export default function MobileCoachNav({ children }: MobileCoachNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border/50 flex items-center px-4 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="p-2 -ml-2 rounded-xl hover:bg-background transition-colors"
        >
          <Menu className="h-5 w-5 text-foreground" />
        </button>
        <span className="ml-3 text-sm font-semibold text-foreground">Coach Dashboard</span>
      </div>

      {/* Overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 animate-in fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Slide-out drawer */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 w-[280px] bg-card border-r border-border/50 flex flex-col z-50 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg hover:bg-background transition-colors"
          >
            <X className="h-4 w-4 text-muted" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
