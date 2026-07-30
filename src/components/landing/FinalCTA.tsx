'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
/**
 * Sección «FinalCTA» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
export function FinalCTA() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <section className="px-6 lg:px-8 py-36 lg:py-56">
      <div className="max-w-[1080px] mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8 }}
          className="font-serif font-normal text-[48px] sm:text-[80px] lg:text-[128px] leading-[0.95] tracking-[-0.035em] text-white mb-14"
        >
          {es ? (
            <>
              Contrata
              <br />
              <em className="font-serif italic text-white/60">de otra forma.</em>
            </>
          ) : (
            <>
              Hire
              <br />
              <em className="font-serif italic text-white/60">differently.</em>
            </>
          )}
        </motion.h2>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login?tab=register&role=employer"
            className="group inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-colors"
          >
            {es ? 'Comienza gratis' : 'Start for free'}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-white/15 text-white/80 text-[14px] font-medium hover:bg-white/[0.04] hover:text-white hover:border-white/25 transition-colors"
          >
            {es ? 'Ver precios' : 'See pricing'}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   OPEN ROLES — interactive accordion (needs client state)
   ───────────────────────────────────────────────────────────── */
