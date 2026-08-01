'use client';

import Link from 'next/link';

import Logo from '@/components/ui/Logo';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
/**
 * Sección «Footer» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
export function Footer() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  return (
    <footer className="border-t border-white/[0.06] px-6 lg:px-8 pt-20 pb-12">
      <div className="max-w-[1320px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 lg:gap-12 mb-16">
          <div className="col-span-2 md:col-span-2">
            <Logo />
            <p className="text-[14px] text-white/60 mt-6 max-w-xs leading-[1.65]">
              {es
                ? 'Entrevistas de IA para equipos que quieren contratar con señal, no con corazonadas.'
                : 'AI interviews for teams that want to hire on signal, not gut.'}
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 mb-5">
              {es ? 'Producto' : 'Product'}
            </div>
            <ul className="space-y-3 text-[14px]">
              <li>
                <Link href="/pricing" className="text-white/65 hover:text-white transition-colors">
                  {es ? 'Precios' : 'Pricing'}
                </Link>
              </li>
              <li>
                <a href="#how-it-works" className="text-white/65 hover:text-white transition-colors">
                  {es ? 'Cómo funciona' : 'How it works'}
                </a>
              </li>
              <li>
                <a href="#roles" className="text-white/65 hover:text-white transition-colors">
                  {es ? 'Posiciones' : 'Roles'}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 mb-5">
              {es ? 'Empresa' : 'Company'}
            </div>
            <ul className="space-y-3 text-[14px]">
              <li>
                <Link href="/practice" className="text-white/65 hover:text-white transition-colors">
                  {t.practiceNav}
                </Link>
              </li>
              <li>
                <a href="mailto:hello@reclutify.com" className="text-white/65 hover:text-white transition-colors">
                  {es ? 'Contacto' : 'Contact'}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 mb-5">Legal</div>
            <ul className="space-y-3 text-[14px]">
              <li>
                <Link href="/privacy" className="text-white/65 hover:text-white transition-colors">
                  {es ? 'Privacidad' : 'Privacy'}
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-white/65 hover:text-white transition-colors">
                  {es ? 'Términos' : 'Terms'}
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-4 text-[12px] text-white/60">
          <p>
            © {new Date().getFullYear()} Reclutify.{' '}
            {es ? 'Todos los derechos reservados.' : 'All rights reserved.'}
          </p>
          <div className="flex items-center gap-6">
            <a href="https://x.com/reclutify" className="hover:text-white transition-colors">
              Twitter
            </a>
            <a href="https://linkedin.com/company/reclutify" className="hover:text-white transition-colors">
              LinkedIn
            </a>
            <a href="https://github.com/reclutify" className="hover:text-white transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
