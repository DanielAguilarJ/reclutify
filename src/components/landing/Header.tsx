'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';

import Logo from '@/components/ui/Logo';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import { useDisclosure } from '@/hooks/useDisclosure';
/**
 * Sección «Header» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
export function Header() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';
  const [scrolled, setScrolled] = useState(false);
  // Apertura, cierre con Escape, clic fuera y `aria-expanded`.
  //
  // El menú solo se cerraba pulsando su fondo, que es una acción de ratón: quien navega con
  // teclado no tenía forma de cerrarlo. Y sin `aria-expanded` el lector de pantalla anunciaba
  // el botón sin decir si el menú está abierto. Ver `src/hooks/useDisclosure.ts`.
  const {
    isOpen: mobileOpen,
    close: closeMobile,
    triggerProps: mobileTriggerProps,
    panelProps: mobilePanelProps,
  } = useDisclosure();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <header className="fixed top-0 inset-x-0 z-50 flex justify-center pointer-events-none pt-4 px-4">
        <motion.nav
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className={`
            pointer-events-auto relative flex items-center gap-1 px-2 py-2 rounded-full
            transition-all duration-500 ease-out
            ${scrolled
              ? 'bg-white/[0.06] shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.1)] border border-white/[0.08]'
              : 'bg-white/[0.04] shadow-[0_4px_24px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.06)] border border-white/[0.06]'
            }
            backdrop-blur-2xl backdrop-saturate-[1.8]
          `}
          style={{
            WebkitBackdropFilter: 'blur(40px) saturate(1.8)',
            backdropFilter: 'blur(40px) saturate(1.8)',
          }}
        >
          {/* Glow effect - top edge light reflection */}
          <div className={`absolute inset-x-4 -top-px h-px transition-opacity duration-500 ${scrolled ? 'opacity-100' : 'opacity-60'}`}>
            <div className="h-full w-full bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          </div>

          {/* Inner subtle glow */}
          <div className={`absolute inset-0 rounded-full transition-opacity duration-500 ${scrolled ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/[0.04] to-transparent" />
          </div>

          {/* Logo */}
          <Link href="/" className="relative flex items-center pl-3 pr-2 py-1 shrink-0">
            <Logo />
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-0.5 px-2">
            {[
              { href: '#product', label: es ? 'Producto' : 'Product' },
              { href: '#how-it-works', label: es ? 'Cómo funciona' : 'How it works' },
              { href: '/pricing', label: es ? 'Precios' : 'Pricing', isLink: true },
              { href: '#roles', label: es ? 'Posiciones' : 'Roles' },
              { href: '/practice', label: t.practiceNav, isLink: true },
            ].map((item) => (
              item.isLink ? (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative px-3.5 py-1.5 text-[13px] text-white/60 hover:text-white transition-all duration-300 rounded-full hover:bg-white/[0.06] group"
                >
                  {item.label}
                  <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-white/0 to-transparent group-hover:via-white/20 transition-all duration-300" />
                </Link>
              ) : (
                <a
                  key={item.href}
                  href={item.href}
                  className="relative px-3.5 py-1.5 text-[13px] text-white/60 hover:text-white transition-all duration-300 rounded-full hover:bg-white/[0.06] group"
                >
                  {item.label}
                  <span className="absolute inset-x-3 -bottom-px h-px bg-gradient-to-r from-transparent via-white/0 to-transparent group-hover:via-white/20 transition-all duration-300" />
                </a>
              )
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-1.5 pl-2">
            <div className="hidden md:block">
              <LanguageToggle />
            </div>
            <Link
              href="/login"
              className="hidden md:inline-flex text-[13px] text-white/60 hover:text-white px-3 py-1.5 rounded-full hover:bg-white/[0.06] transition-all duration-300"
            >
              {es ? 'Iniciar sesión' : 'Log in'}
            </Link>
            <Link
              href="/login?mode=register"
              className="relative inline-flex items-center gap-1.5 pl-4 pr-3.5 py-2 rounded-full bg-white text-[#0a0a0a] text-[13px] font-semibold hover:bg-white/90 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              {es ? 'Empieza' : 'Get started'}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            {/* Mobile menu toggle */}
            <button
              {...mobileTriggerProps}
              aria-label={
                mobileOpen
                  ? es ? 'Cerrar menú' : 'Close menu'
                  : es ? 'Abrir menú' : 'Open menu'
              }
              className="md:hidden flex items-center justify-center h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-300"
            >
              {/* El icono es decorativo: el estado y la acción los comunica `aria-label`
                  junto a `aria-expanded`. */}
              {mobileOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </motion.nav>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            {...mobilePanelProps}
            className="fixed inset-0 z-40 md:hidden"
          >
            {/* El fondo queda como atajo de ratón; el cierre con teclado lo cubre el hook.
                `aria-hidden` porque no es contenido: es superficie de clic. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-2xl"
              onClick={closeMobile}
            />
            <motion.div
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="relative mt-20 mx-4 p-6 rounded-3xl bg-white/[0.05] border border-white/[0.08] backdrop-blur-2xl"
              style={{ WebkitBackdropFilter: 'blur(40px)' }}
            >
              <nav className="flex flex-col gap-1">
                {[
                  { href: '#product', label: es ? 'Producto' : 'Product' },
                  { href: '#how-it-works', label: es ? 'Cómo funciona' : 'How it works' },
                  { href: '/pricing', label: es ? 'Precios' : 'Pricing' },
                  { href: '#roles', label: es ? 'Posiciones' : 'Roles' },
                  { href: '/practice', label: t.practiceNav },
                ].map((item, i) => (
                  <motion.a
                    key={item.href}
                    href={item.href}
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.15 + i * 0.05 }}
                    onClick={closeMobile}
                    className="px-4 py-3 text-sm text-white/70 hover:text-white hover:bg-white/[0.06] rounded-xl transition-all duration-300"
                  >
                    {item.label}
                  </motion.a>
                ))}
              </nav>
              <div className="mt-4 pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <LanguageToggle />
                <Link
                  href="/login?mode=register"
                  className="inline-flex items-center gap-1.5 pl-4 pr-3.5 py-2 rounded-full bg-white text-[#0a0a0a] text-[13px] font-semibold"
                >
                  {es ? 'Empieza' : 'Get started'}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   STATS — animated on scroll
   ───────────────────────────────────────────────────────────── */
