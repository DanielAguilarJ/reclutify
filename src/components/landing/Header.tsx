'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';

import Logo from '@/components/ui/Logo';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import { useDisclosure } from '@/hooks/useDisclosure';

/**
 * Header de la landing — dirección «riel que se contrae».
 *
 * DOS FORMAS, UN COMPONENTE
 * -------------------------
 * Arriba de la página es un riel a todo el ancho cuyo contenido se alinea con la misma
 * rejilla de 1320 px que usa el resto de la landing, así que el header deja de flotar
 * desalineado del contenido. Al bajar se contrae en una píldora flotante compacta.
 *
 * POR QUÉ EL RIEL Y NO SOLO LA PÍLDORA
 * ------------------------------------
 * La píldora completa mide ~916 px. Entre 768 y 1023 px no cabe, así que la versión
 * anterior escondía los cinco enlaces detrás del hamburguesa teniendo 700 px de ancho
 * libre al lado. El riel sí cabe ahí —necesita 645 px— porque ocupa todo el ancho, de
 * modo que en tablet la navegación permanece visible y lo que se repliega al panel es
 * el selector de idioma y el texto de «Iniciar sesión».
 *
 * CONTRATO RESPONSIVE
 * -------------------
 *   ≥1024px (lg)  riel/píldora completos: marca · 5 enlaces · idioma · sesión · CTA
 *   768–1023 (md) marca · 5 enlaces · CTA · hamburguesa (idioma y sesión en el panel)
 *   <768px        marca · CTA · hamburguesa (todo lo demás en el panel)
 *
 * El límite de 768 px está medido, no elegido: ver `src/__tests__/components/
 * landing-header.test.tsx` y el script de hit-test que acompaña al PR.
 *
 * LAS CAPAS DE CRISTAL NO SON DECORACIÓN INOCUA
 * ---------------------------------------------
 * Toda capa `absolute` de este componente lleva `pointer-events-none` y `aria-hidden`.
 * Sin lo primero, una capa `inset-0` se pinta en la capa de posicionados y se traga los
 * clics de cualquier control que no esté posicionado — que es exactamente cómo
 * «Iniciar sesión» y el hamburguesa quedaron inservibles. `opacity-0` no desactiva los
 * eventos de puntero. El test de regresión lo fija.
 */
export function Header() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';
  const [scrolled, setScrolled] = useState(false);
  /**
   * `false` hasta un fotograma después de sincronizar con la posición real de scroll.
   *
   * POR QUÉ HACE FALTA
   * ------------------
   * `scrolled` tiene que arrancar en `false` porque el componente se renderiza también
   * en el servidor y `window` no existe ahí; inicializarlo desde `window.scrollY` daría
   * un desajuste de hidratación. Pero eso significa que al recargar una página que ya
   * estaba desplazada, el primer render es el RIEL y el segundo la PÍLDORA — y `layout`
   * interpreta esa corrección como un cambio que hay que animar.
   *
   * Medido: 384px de recorrido animándose en el montaje, es decir un destello del estado
   * equivocado en cada recarga. Con esta bandera la corrección inicial es instantánea y
   * solo los cambios de scroll POSTERIORES animan. La animación de entrada (fundido) no
   * se toca: se anula únicamente la sub-transición `layout`.
   */
  const [layoutReady, setLayoutReady] = useState(false);
  const reduceMotion = useReducedMotion();

  // Apertura, cierre con Escape, clic fuera y `aria-expanded`.
  const {
    isOpen: mobileOpen,
    close: closeMobile,
    triggerProps: mobileTriggerProps,
    panelProps: mobilePanelProps,
  } = useDisclosure();

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    const raf = requestAnimationFrame(() => setLayoutReady(true));
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const navItems = [
    { href: '#product', label: es ? 'Producto' : 'Product', isLink: false },
    { href: '#how-it-works', label: es ? 'Cómo funciona' : 'How it works', isLink: false },
    { href: '/pricing', label: es ? 'Precios' : 'Pricing', isLink: true },
    { href: '#roles', label: es ? 'Posiciones' : 'Roles', isLink: false },
    { href: '/practice', label: t.practiceNav, isLink: true },
  ];

  // Alturas de control. 40px en el riel, 36px en la píldora contraída: la píldora es el
  // estado compacto, y bajar de 36 rompería el mínimo de 24x24 de WCAG 2.2 SC 2.5.8 en
  // cuanto el padding horizontal se estrechara. En el panel móvil son 44px (tacto).
  const ctrlH = scrolled ? 'h-9' : 'h-10';

  const linkClass =
    `relative inline-flex items-center rounded-full px-3.5 text-[13px] text-white/65 ` +
    `transition-colors duration-300 hover:bg-white/[0.07] hover:text-white ${ctrlH}`;

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
        <motion.div
          /* `layout` no es adorno: sin él la transición riel → píldora medía un salto de
             394px de ancho en UN fotograma (102% del recorrido) y el alto caía de 69 a
             40.6px para luego subir a 50. Ni el ancho ni el alto son interpolables por
             CSS cuando se pasa de `100%`/`68px` a contenido, así que lo que se veía era
             un parpadeo con las esquinas redondeándose después. `layout` mide antes y
             después y anima el TRANSFORM (FLIP), que sí es continuo.

             `borderRadius` va en `style` y no en clase a propósito: Framer solo puede
             compensar la distorsión del radio durante el escalado si lo controla él. */
          layout
          initial={{ y: -18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{
            ...(reduceMotion
              ? { duration: 0 }
              : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }),
            // Solo la sub-transición de geometría se anula en el montaje; el fundido de
            // entrada sí se reproduce.
            layout:
              reduceMotion || !layoutReady
                ? { duration: 0 }
                : { type: 'spring', stiffness: 220, damping: 30 },
          }}
          style={{
            borderRadius: scrolled ? 9999 : 0,
            WebkitBackdropFilter: scrolled
              ? 'blur(44px) saturate(190%)'
              : 'blur(26px) saturate(150%)',
          }}
          className={[
            'pointer-events-auto relative isolate overflow-hidden',
            // Solo lo que CSS sí interpola bien. La geometría la lleva `layout`.
            'transition-[background-color,box-shadow,border-color,backdrop-filter]',
            reduceMotion ? 'duration-0' : 'duration-500',
            'ease-out',
            scrolled
              ? [
                  'mt-3 p-1.5',
                  'border border-white/[0.14]',
                  'bg-white/[0.07]',
                  'shadow-[0_22px_60px_-16px_rgba(0,0,0,0.85)]',
                  'backdrop-blur-[44px] backdrop-saturate-[1.9]',
                ].join(' ')
              : [
                  'mt-0 w-full p-0',
                  'border-b border-white/[0.07]',
                  'bg-white/[0.035]',
                  'shadow-none',
                  'backdrop-blur-[26px] backdrop-saturate-150',
                ].join(' '),
          ].join(' ')}
        >
          {/* Reflejo especular. La luz entra por arriba, como en un canto biselado. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent transition-opacity duration-500 ${
              scrolled ? 'from-white/[0.09]' : 'from-white/[0.05]'
            }`}
          />
          {/* Filete de luz en el borde superior. */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent transition-opacity duration-500 ${
              scrolled ? 'opacity-100' : 'opacity-60'
            }`}
          />

          <motion.nav
            layout="position"
            aria-label={es ? 'Navegación principal' : 'Main navigation'}
            className={`relative mx-auto flex items-center ${
              scrolled
                ? 'gap-1'
                : 'h-[68px] w-full max-w-[1320px] justify-between gap-4 px-6 lg:px-8'
            }`}
          >
            {/* `tone="light"` explícito: `auto` resuelve `text-black dark:text-white`, y sin
                `@custom-variant dark` declarado Tailwind v4 lo decide por
                `prefers-color-scheme` del SO, no por el `[data-theme]` de la app. Con la
                landing en #0a0a0a eso dejaba el wordmark a 1.14:1 medido. */}
            <Link
              href="/"
              className={`relative flex shrink-0 items-center rounded-full ${
                scrolled ? 'pl-3 pr-2' : 'pr-2'
              } ${ctrlH}`}
            >
              <Logo tone="light" />
            </Link>

            {/* Enlaces. Visibles desde 768px: el riel tiene ancho para ellos. */}
            <div className="relative hidden items-center gap-0.5 md:flex">
              {navItems.map((item) =>
                item.isLink ? (
                  <Link key={item.href} href={item.href} className={linkClass}>
                    {item.label}
                  </Link>
                ) : (
                  <a key={item.href} href={item.href} className={linkClass}>
                    {item.label}
                  </a>
                ),
              )}
            </div>

            <div className="relative flex shrink-0 items-center gap-2">
              {/* Idioma y sesión solo desde 1024px. Entre 768 y 1023 viven en el panel:
                  es lo que libera el ancho que necesitan los cinco enlaces. */}
              <div className="hidden lg:block">
                <LanguageToggle tone="light" />
              </div>
              <Link
                href="/login"
                className={`relative hidden items-center rounded-full px-3.5 text-[13px] text-white/65 transition-colors duration-300 hover:bg-white/[0.07] hover:text-white lg:inline-flex ${ctrlH}`}
              >
                {es ? 'Iniciar sesión' : 'Log in'}
              </Link>

              <Link
                href="/login?mode=register"
                className={`relative inline-flex items-center gap-1.5 rounded-full bg-white pl-4 pr-3.5 text-[13px] font-semibold text-[#0a0a0a] shadow-[0_0_24px_rgba(255,255,255,0.14)] transition-shadow duration-300 hover:shadow-[0_0_34px_rgba(255,255,255,0.26)] ${ctrlH}`}
              >
                {es ? 'Empieza' : 'Get started'}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>

              {/* Hamburguesa por debajo de 1024px. 44x44 de área táctil: el icono mide 18,
                  el resto es zona de toque. */}
              <button
                {...mobileTriggerProps}
                aria-label={
                  mobileOpen
                    ? es
                      ? 'Cerrar menú'
                      : 'Close menu'
                    : es
                      ? 'Abrir menú'
                      : 'Open menu'
                }
                className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors duration-300 hover:bg-white/[0.08] hover:text-white lg:hidden"
              >
                {/* El icono es decorativo: el estado y la acción los comunica `aria-label`
                    junto a `aria-expanded`. */}
                {mobileOpen ? (
                  <X className="h-[18px] w-[18px]" aria-hidden="true" />
                ) : (
                  <Menu className="h-[18px] w-[18px]" aria-hidden="true" />
                )}
              </button>
            </div>
          </motion.nav>
        </motion.div>
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
            className="fixed inset-0 z-40 lg:hidden"
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
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3, delay: 0.1 }}
              className="relative mx-4 mt-20 rounded-3xl border border-white/[0.10] bg-white/[0.06] p-5 backdrop-blur-[40px] backdrop-saturate-150 md:ml-auto md:w-[300px]"
              style={{ WebkitBackdropFilter: 'blur(40px) saturate(150%)' }}
            >
              {/* Mismo reflejo especular que el riel, para que el panel se lea como la
                  misma familia de material y no como otro componente. */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-b from-white/[0.06] to-transparent"
              />

              <nav
                aria-label={es ? 'Navegación' : 'Navigation'}
                className="relative flex flex-col"
              >
                {/* `md:hidden`: entre 768 y 1023 px estos cinco enlaces ya están visibles en
                    el riel, así que repetirlos aquí sería ruido. Por debajo de 768 px son la
                    única vía y el panel los muestra. */}
                <div className="flex flex-col md:hidden">
                  {navItems.map((item, i) =>
                    item.isLink ? (
                      <motion.div
                        key={item.href}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { delay: 0.15 + i * 0.05 }}
                      >
                        <Link
                          href={item.href}
                          onClick={closeMobile}
                          className="flex min-h-11 items-center rounded-xl px-4 text-[15px] text-white/75 transition-colors duration-300 hover:bg-white/[0.07] hover:text-white"
                        >
                          {item.label}
                        </Link>
                      </motion.div>
                    ) : (
                      <motion.a
                        key={item.href}
                        href={item.href}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={reduceMotion ? { duration: 0 } : { delay: 0.15 + i * 0.05 }}
                        onClick={closeMobile}
                        className="flex min-h-11 items-center rounded-xl px-4 text-[15px] text-white/75 transition-colors duration-300 hover:bg-white/[0.07] hover:text-white"
                      >
                        {item.label}
                      </motion.a>
                    ),
                  )}
                  <div aria-hidden="true" className="my-2 h-px bg-white/[0.08]" />
                </div>

                {/* Acceso a la cuenta. Es la razón de ser del panel entre 768 y 1023 px:
                    ahí el riel cede este espacio para conservar los cinco enlaces. */}
                <Link
                  href="/login"
                  onClick={closeMobile}
                  className="flex min-h-11 items-center rounded-xl px-4 text-[15px] text-white/75 transition-colors duration-300 hover:bg-white/[0.07] hover:text-white"
                >
                  {es ? 'Iniciar sesión' : 'Log in'}
                </Link>
              </nav>

              {/* Solo el selector de idioma. «Empieza» no se repite aquí: ya está en el
                  riel, visible en todos los anchos, y duplicar la acción principal a 30px
                  de distancia no añade una vía nueva, solo compite consigo misma. */}
              <div className="relative mt-3 flex items-center justify-between border-t border-white/[0.08] pt-4">
                <span className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                  {es ? 'Idioma' : 'Language'}
                </span>
                <LanguageToggle tone="light" />
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
