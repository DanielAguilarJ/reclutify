'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
import { TRUSTED_LOGOS } from './data';
/**
 * Sección «HeroSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
export function HeroSection() {
  const { language } = useAppStore();
  const es = language === 'es';
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const videoY = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);

  return (
    <section ref={heroRef} className="relative overflow-hidden pt-40 lg:pt-48 pb-28 lg:pb-36 px-6 lg:px-8">
      {/* Video background with parallax */}
      <motion.div
        style={{ y: videoY }}
        className="absolute inset-0 -top-[10%] -bottom-[10%] z-0 pointer-events-none"
      >
        <video
          autoPlay
          muted
          loop
          playsInline
          aria-label="Reclutify AI interview platform demo - AI-powered hiring for companies"
          className="absolute inset-0 w-full h-full object-cover"
          src="/hero.mp4"
        />
        <div className="absolute inset-0 bg-[#0a0a0a]/60" />
        <div className="absolute inset-0 backdrop-blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0a]/30 via-transparent to-[#0a0a0a]/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0a]/50 via-transparent to-[#0a0a0a]/20" />
      </motion.div>

      <div className="relative z-10 max-w-[1320px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-white/60 mb-12"
        >
          <span className="w-7 h-px bg-white/25" />
          {es ? 'Reclutamiento, con intención' : 'Hiring, with intent'}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif font-normal text-[44px] sm:text-[68px] lg:text-[112px] leading-[0.94] tracking-[-0.035em] text-white max-w-[12ch]"
        >
          {es ? (
            <>
              Entrevistas que
              <br />
              <em className="not-italic font-serif italic text-white/55">cuentan algo.</em>
            </>
          ) : (
            <>
              Interviews that
              <br />
              <em className="not-italic font-serif italic text-white/55">actually tell you something.</em>
            </>
          )}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="mt-12 lg:mt-14 max-w-[560px] text-[17px] lg:text-[19px] text-white/60 leading-[1.55]"
        >
          {es
            ? 'Reclutify reemplaza la llamada de filtro con una conversación adaptativa. Tu equipo recibe transcripciones, puntuaciones por rúbrica y una recomendación clara — sin agendar nada.'
            : 'Reclutify replaces the screening call with an adaptive conversation. Your team gets transcripts, rubric-based scores, and a clear recommendation — with nothing to schedule.'}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-12 flex flex-col sm:flex-row gap-3"
        >
          <Link
            href="/login?tab=register&role=employer"
            className="group inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-white text-black text-[14px] font-medium hover:bg-white/90 transition-colors"
          >
            {es ? 'Comienza gratis' : 'Start for free'}
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-white/15 text-white/80 text-[14px] font-medium hover:bg-white/[0.04] hover:text-white hover:border-white/25 transition-colors"
          >
            {es ? 'Ver cómo funciona' : 'See how it works'}
          </a>
        </motion.div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   TRUSTED LOGOS — animated infinite scroll
   ───────────────────────────────────────────────────────────── */

export function TrustedLogosAnimated() {
  return (
    <div className="flex overflow-hidden mask-fade-x">
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ ease: 'linear', duration: 55, repeat: Infinity }}
        className="flex flex-nowrap items-center gap-14 lg:gap-20 shrink-0 pr-14 lg:pr-20"
      >
        {[...TRUSTED_LOGOS, ...TRUSTED_LOGOS].map((logo, i) => (
          <img
            key={i}
            src={logo.src}
            alt={logo.name}
            className="h-6 lg:h-7 w-auto object-contain brightness-0 invert opacity-45 hover:opacity-90 transition-opacity"
          />
        ))}
      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   HEADER — client side for language toggle + nav links
   ───────────────────────────────────────────────────────────── */

export function TrustedByLabel() {
  const { language } = useAppStore();
  const t = dictionaries[language];

  return (
    <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-10">
      {t.trustedBy}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FOOTER — language-dependent
   ───────────────────────────────────────────────────────────── */
