'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
/**
 * Sección «SplitSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
export function SplitHeading() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-8">
        {es ? 'Para quién' : 'Built for'}
      </div>
      <h2 className="font-serif font-normal text-[40px] lg:text-[64px] leading-[1] tracking-[-0.025em] text-white mb-16 max-w-[16ch]">
        {es ? '¿Qué estás buscando?' : 'What are you looking for?'}
      </h2>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   TESTIMONIAL SECTION HEADING — language-dependent
   ───────────────────────────────────────────────────────────── */

export function SplitCards() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-5">
      {/* Employer */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
      >
        <Link
          href="/login?tab=register&role=employer"
          className="group block bg-[#F5F4ED] text-[#0a0a0a] rounded-[28px] p-10 lg:p-14 h-full transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.5)]"
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-[#0a0a0a]/45 mb-14">
            {t.roleSplitBadgeEmployer}
          </div>
          <h3 className="font-serif font-normal text-[36px] lg:text-[52px] leading-[1.02] tracking-[-0.025em] mb-8 max-w-[14ch]">
            {t.roleSplitTitleEmployer}
          </h3>
          <p className="text-[15px] lg:text-[16px] text-[#0a0a0a]/60 leading-[1.6] max-w-md mb-14">
            {t.roleSplitSubEmployer}
          </p>
          <div className="inline-flex items-center gap-2 text-[14px] font-medium border-b border-[#0a0a0a]/30 pb-0.5 group-hover:border-[#0a0a0a] transition-colors">
            {es ? 'Comenzar como empleador' : 'Start as employer'}
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </Link>
      </motion.div>

      {/* Candidate */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <Link
          href="/login?tab=register&role=candidate"
          className="group block bg-[#0e0e10] text-white rounded-[28px] p-10 lg:p-14 h-full border border-white/[0.07] transition-all duration-500 hover:-translate-y-1 hover:border-white/[0.14] hover:shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)]"
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-14">
            {t.roleSplitBadgeCandidate}
          </div>
          <h3 className="font-serif font-normal text-[36px] lg:text-[52px] leading-[1.02] tracking-[-0.025em] mb-8 max-w-[14ch]">
            {t.roleSplitTitleCandidate}
          </h3>
          <p className="text-[15px] lg:text-[16px] text-white/60 leading-[1.6] max-w-md mb-14">
            {t.roleSplitSubCandidate}
          </p>
          <div className="inline-flex items-center gap-2 text-[14px] font-medium border-b border-white/30 pb-0.5 group-hover:border-white transition-colors">
            {es ? 'Comenzar como candidato' : 'Start as candidate'}
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
        </Link>
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TESTIMONIAL — big quote with animation
   ───────────────────────────────────────────────────────────── */
