'use client';

import Link from 'next/link';

import Logo from '@/components/ui/Logo';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';

/**
 * Sección «Footer» de la landing.
 *
 * Dirección visual «Índice + CTA»: un panel de cierre arriba, y los enlaces como
 * un índice de filas atadas por filetes en lugar de columnas flotando. Sustituye
 * a la rejilla de 5 tracks anterior, que a 1440 dejaba 227px muertos entre la
 * columna de marca y la primera de enlaces, gastaba dos tercios de su altura en
 * padding vacío, y a 390 dejaba «Legal» huérfano en una tercera fila.
 *
 * La landing fuerza `bg-[#0a0a0a]` y no sigue el switch de tema, así que los
 * colores de esta sección son explícitos a propósito — misma convención que
 * `src/app/page.tsx`. Los valores salen medidos: #9d9d9d da 7.3:1 y #c9c9d1
 * da 11.2:1 sobre #0a0a0a, ambos por encima del 4.5:1 de WCAG AA.
 */

const RULE = 'border-white/[0.08]';
const INK_MUTED = 'text-[#9d9d9d]';   // 7.3:1  sobre #0a0a0a
const INK_LINK = 'text-[#c9c9d1]';    // 11.2:1 sobre #0a0a0a

/** Enlace de navegación: 44px de alto real para que el objetivo táctil sea cómodo. */
const NAV_LINK =
  `flex items-center min-h-[44px] text-[15px] ${INK_LINK} rounded-sm transition-colors ` +
  'hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus-visible:ring-[#d3fb52]';

/** Social como icono con borde: en el footer anterior eran palabras indistinguibles del copyright. */
const SOCIAL_BTN =
  `grid place-items-center w-10 h-10 rounded-[10px] ${INK_MUTED} border ${RULE} transition-colors ` +
  'hover:text-white hover:border-white/[0.16] hover:bg-white/[0.04] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus-visible:ring-[#d3fb52]';

const SOCIALS = [
  {
    href: 'https://x.com/reclutify',
    label: 'X',
    path: 'M18.9 2H22l-6.8 7.8L23 22h-6.9l-4.6-6.1L6.2 22H3l7.2-8.2L2.3 2h6.9l4.3 5.7L18.9 2Zm-1.2 18h1.7L7.4 3.8H5.6L17.7 20Z',
  },
  {
    href: 'https://linkedin.com/company/reclutify',
    label: 'LinkedIn',
    path: 'M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05A4.2 4.2 0 0 1 17.6 8.7c3 0 3.4 1.9 3.4 4.5V21h-4v-6.3c0-1.5-.03-3.4-2.1-3.4-2.1 0-2.4 1.6-2.4 3.3V21h-3.9V9Z',
  },
  {
    href: 'https://github.com/reclutify',
    label: 'GitHub',
    path: 'M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.35 4.69-4.58 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z',
  },
] as const;

/** Una fila del índice: etiqueta en la canaleta izquierda, enlaces envolviendo a la derecha. */
function IndexRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      className={`grid grid-cols-1 gap-0.5 py-4 border-b ${RULE} min-[720px]:grid-cols-[132px_1fr] min-[720px]:gap-8 min-[720px]:items-baseline min-[720px]:py-3.5`}
    >
      <div className={`text-[11px] uppercase tracking-[0.18em] ${INK_MUTED} pt-3.5 min-[720px]:pt-[13px]`}>
        {label}
      </div>
      <ul className="flex flex-wrap list-none gap-x-7 m-0 p-0">{children}</ul>
    </div>
  );
}

export function Footer() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  return (
    <footer className={`border-t ${RULE} px-6 lg:px-8 pt-[52px] pb-7 min-[820px]:pt-16 min-[820px]:pb-8`}>
      <div className="max-w-[1320px] mx-auto">

        {/* Panel de cierre */}
        <section
          className={`grid items-center gap-5 rounded-2xl border border-white/[0.16] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-[26px] min-[820px]:grid-cols-[1fr_auto] min-[820px]:gap-10 min-[820px]:px-10 min-[820px]:py-8`}
        >
          <h2 className="m-0 max-w-[24ch] text-[21px] min-[820px]:text-[27px] font-bold leading-[1.2] tracking-[-0.02em] text-[#fafafa]">
            {es ? 'Empieza a entrevistar con señal' : 'Start interviewing on signal'}
          </h2>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2.5 min-h-[46px] px-[22px] rounded-[11px] bg-lime-30 text-[#0a0a0a] text-[15px] font-semibold whitespace-nowrap transition-colors hover:bg-lime-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus-visible:ring-[#fafafa]"
          >
            {es ? 'Ver precios' : 'See pricing'}
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h13M12 5l7 7-7 7" />
            </svg>
          </Link>
        </section>

        {/* Marca + social, alineadas al mismo baseline */}
        <div className="grid gap-[18px] mt-[34px] mb-[26px] min-[900px]:grid-cols-[minmax(0,1fr)_auto] min-[900px]:gap-12 min-[900px]:items-start min-[900px]:mt-12 min-[900px]:mb-9">
          <div>
            {/* tone="light": la landing fuerza fondo oscuro y `dark:` no lo sigue */}
            <Logo tone="light" />
            <p className={`mt-3 max-w-[32ch] text-[15px] leading-[1.6] ${INK_MUTED}`}>
              {es
                ? 'Entrevistas de IA para equipos que quieren contratar con señal, no con corazonadas.'
                : 'AI interviews for teams that want to hire on signal, not gut.'}
            </p>
          </div>
          <div className="flex gap-2 min-[900px]:justify-end min-[900px]:pt-0.5">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={`Reclutify ${es ? 'en' : 'on'} ${s.label}`}
                className={SOCIAL_BTN}
              >
                <svg viewBox="0 0 24 24" className="w-[17px] h-[17px] fill-current" aria-hidden="true">
                  <path d={s.path} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Índice de enlaces */}
        <nav className={`border-t ${RULE}`} aria-label={es ? 'Enlaces del pie' : 'Footer links'}>
          <IndexRow label={es ? 'Producto' : 'Product'}>
            <li>
              <Link href="/pricing" className={NAV_LINK}>
                {es ? 'Precios' : 'Pricing'}
              </Link>
            </li>
            <li>
              <a href="#how-it-works" className={NAV_LINK}>
                {es ? 'Cómo funciona' : 'How it works'}
              </a>
            </li>
            <li>
              <a href="#roles" className={NAV_LINK}>
                {es ? 'Posiciones' : 'Roles'}
              </a>
            </li>
          </IndexRow>

          <IndexRow label={es ? 'Empresa' : 'Company'}>
            <li>
              <Link href="/practice" className={NAV_LINK}>
                {t.practiceNav}
              </Link>
            </li>
            <li>
              <a href="mailto:hello@reclutify.com" className={NAV_LINK}>
                {es ? 'Contacto' : 'Contact'}
              </a>
            </li>
          </IndexRow>

          <IndexRow label="Legal">
            <li>
              <Link href="/privacy" className={NAV_LINK}>
                {es ? 'Privacidad' : 'Privacy'}
              </Link>
            </li>
            <li>
              <Link href="/terms" className={NAV_LINK}>
                {es ? 'Términos' : 'Terms'}
              </Link>
            </li>
          </IndexRow>
        </nav>

        {/* Barra base */}
        <div className="mt-[26px] flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
          <p className={`m-0 text-[12px] ${INK_MUTED}`}>
            © {new Date().getFullYear()} Reclutify.{' '}
            {es ? 'Todos los derechos reservados.' : 'All rights reserved.'}
          </p>
          <a
            href="mailto:hello@reclutify.com"
            className={`inline-flex items-center min-h-[44px] text-[12px] ${INK_MUTED} rounded-sm transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] focus-visible:ring-[#d3fb52]`}
          >
            hello@reclutify.com
          </a>
        </div>

      </div>
    </footer>
  );
}
