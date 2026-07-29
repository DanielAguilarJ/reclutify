'use client';

/**
 * Armazón de dos columnas de las pantallas del empleado.
 *
 * ── Decisión de diseño ────────────────────────────────────────────────────────
 *
 * El Centro de Capacitación era una columna de tarjetas idénticas: el índice del
 * programa no existía y había que deducirlo leyendo la lista. Aquí el índice es
 * estructura, igual que en cualquier plataforma de cursos: columna lateral
 * persistente a la izquierda y contenido a la derecha.
 *
 * En móvil la lateral NO desaparece: se convierte en un panel deslizable con
 * `role="dialog"`, foco gestionado y cierre por `Escape`. El contenido del panel
 * solo se monta cuando está abierto, para no duplicar el índice en el árbol de
 * accesibilidad.
 *
 * `MotionConfig reducedMotion="user"` cubre a todos los descendientes animados:
 * quien pide menos movimiento en el sistema no recibe desplazamientos ni
 * escalados, solo cambios de opacidad.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { PanelLeft, X } from 'lucide-react';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import { getTrainingCopy } from '@/lib/training/center-copy';
import { focusRing, iconButton } from './ui';

interface TrainingShellProps {
  language: TrainingContentLanguage;
  /** Índice del programa. Se renderiza en la lateral y en el panel móvil. */
  sidebar: ReactNode;
  /** Barra superior fija opcional (la usa la vista de módulo). */
  topBar?: ReactNode;
  children: ReactNode;
}

export function TrainingShell({
  language,
  sidebar,
  topBar,
  children,
}: TrainingShellProps) {
  const copy = getTrainingCopy(language).center.outline;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();

  // Foco al abrir, cierre con Escape y devolución del foco al disparador: sin
  // esto el panel móvil es una trampa para quien navega con teclado.
  useEffect(() => {
    if (!drawerOpen) return;

    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    triggerRef.current?.focus();
  };

  const stickyOffset = topBar
    ? 'lg:top-[4.5rem] lg:max-h-[calc(100vh-6rem)]'
    : 'lg:top-8 lg:max-h-[calc(100vh-4rem)]';

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-background text-foreground">
        {topBar ? (
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
            {topBar}
          </header>
        ) : null}

        <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 sm:px-6">
          <aside className="hidden w-72 shrink-0 py-8 lg:block">
            <div className={`sticky overflow-y-auto ${stickyOffset}`}>
              {sidebar}
            </div>
          </aside>

          <main className="min-w-0 flex-1 py-6 lg:py-8">
            <div className="mb-5 lg:hidden">
              <button
                ref={triggerRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                aria-expanded={drawerOpen}
                aria-controls={drawerId}
                className={`inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-card-hover ${focusRing}`}
              >
                <PanelLeft className="h-4 w-4 text-muted" aria-hidden="true" />
                {copy.openDrawer}
              </button>
            </div>

            {children}
          </main>
        </div>

        <AnimatePresence>
          {drawerOpen ? (
            <div className="fixed inset-0 z-50 lg:hidden">
              <motion.button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={closeDrawer}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 h-full w-full cursor-default bg-neutral-90/50"
              />

              <motion.div
                id={drawerId}
                role="dialog"
                aria-modal="true"
                aria-label={copy.title}
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="absolute inset-y-0 left-0 flex w-[19rem] max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-card p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-semibold">{copy.title}</span>
                  <button
                    ref={closeRef}
                    type="button"
                    onClick={closeDrawer}
                    aria-label={copy.closeDrawer}
                    className={iconButton}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {sidebar}
              </motion.div>
            </div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
