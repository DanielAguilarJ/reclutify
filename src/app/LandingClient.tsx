'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  MapPin,
  Briefcase,
  Clock,
  DollarSign,
  Check,
  Minus,
  Menu,
  X,
} from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';

const trustedLogos = [
  { name: 'WorldBrain', src: '/worldbrain-logo.webp' },
  { name: 'Microsoft', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6423178f81ce716edd7f851a_Micrisoft.svg' },
  { name: 'Canva', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/66301630500a1dd9056ad3be_Canva.svg' },
  { name: 'Deloitte', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6423176ff5659248257a1053_Deloitte.svg' },
  { name: 'Dropbox', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/66301659ea49592bc352ceaf_Dropbox.svg' },
  { name: 'TikTok', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6630168a0d47e34ca6b6381c_tiktok.svg' },
  { name: 'Paysafe', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016a6f2c1503f941c19a7_Paysafe.svg' },
  { name: 'Ubisoft', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016bcd41fa1628a33e4bc_Ubisoft.svg' },
  { name: 'IBM', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016cdbc3f2d38f6e11f46_IBM.svg' },
  { name: 'Forrester', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/663016eef2c1503f941c5338_Forrester.svg' },
  { name: 'Samsung', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6589fcd9f3fc8359012852be_Samsung.svg' },
  { name: 'Red Bull', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/66301727ea9ebc03c4d821e9_Red%20Bull.svg' },
  { name: 'Atlassian', src: 'https://cdn.prod.website-files.com/61f9082050036c5b7a4899f5/6709aeacf1dab4a7064543a0_Atlassian.svg' },
];

/* ─────────────────────────────────────────────────────────────
   HERO SECTION — parallax video + animated entrance
   ───────────────────────────────────────────────────────────── */
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
        {[...trustedLogos, ...trustedLogos].map((logo, i) => (
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
export function Header() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden flex items-center justify-center h-8 w-8 rounded-full text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-300"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
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
            className="fixed inset-0 z-40 md:hidden"
          >
            <div className="absolute inset-0 bg-[#0a0a0a]/90 backdrop-blur-2xl" onClick={() => setMobileOpen(false)} />
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
                    onClick={() => setMobileOpen(false)}
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
export function StatsGrid() {
  const { language } = useAppStore();
  const es = language === 'es';

  const stats = [
    { value: '40h', label: es ? 'Ahorradas a la semana' : 'Saved per week' },
    { value: '4 min', label: es ? 'Entrevista media' : 'Median interview' },
    { value: '60%', label: es ? 'Menos tiempo a oferta' : 'Less time-to-offer' },
    { value: '24/7', label: es ? 'Disponibilidad continua' : 'Continuous availability' },
  ];

  return (
    <div className="mt-24 lg:mt-32 grid grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12 border-t border-white/[0.06] pt-12 lg:pt-16">
      {stats.map((s, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: i * 0.06 }}
        >
          <div className="font-serif text-[56px] lg:text-[80px] text-white tracking-[-0.03em] leading-[0.95] mb-4">
            {s.value}
          </div>
          <div className="text-[13px] text-white/60 leading-snug max-w-[180px]">
            {s.label}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   HOW IT WORKS — animated steps
   ───────────────────────────────────────────────────────────── */
export function HowItWorksSteps() {
  const { language } = useAppStore();
  const es = language === 'es';

  const steps = [
    {
      num: '01',
      title: es ? 'Crea la vacante' : 'Create the role',
      desc: es
        ? 'Define los requisitos. Generamos la rúbrica de evaluación y un enlace único en dos minutos.'
        : 'Define requirements. We generate the evaluation rubric and a unique link in two minutes.',
    },
    {
      num: '02',
      title: es ? 'Envía el enlace' : 'Send the link',
      desc: es
        ? 'Cada candidato entra desde su navegador, en su horario. Sin instalaciones, sin agendas, sin Zoom.'
        : 'Every candidate enters from their browser, on their schedule. No installs, no scheduling, no Zoom.',
    },
    {
      num: '03',
      title: es ? 'Lee el reporte' : 'Read the report',
      desc: es
        ? 'Recibe puntuaciones por tema, transcripción, video, banderas y una recomendación clara. Decide en minutos.'
        : 'Get per-topic scores, transcript, video, flags, and a clear recommendation. Decide in minutes.',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.06] border border-white/[0.06] rounded-2xl overflow-hidden">
      {steps.map((step, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: i * 0.08 }}
          className="bg-[#0a0a0a] p-10 lg:p-14"
        >
          <div className="font-serif text-[26px] text-white/60 mb-16 tracking-[0.05em]">
            {step.num}
          </div>
          <h3 className="font-serif font-normal text-[28px] lg:text-[32px] text-white tracking-[-0.015em] leading-[1.1] mb-5">
            {step.title}
          </h3>
          <p className="text-white/60 leading-[1.6] text-[15px]">{step.desc}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SPLIT CARDS — employer / candidate
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
export function BigTestimonial() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <motion.blockquote
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.8 }}
      className="font-serif font-normal text-[30px] sm:text-[44px] lg:text-[64px] leading-[1.12] tracking-[-0.02em] text-white"
    >
      <span className="text-white/60">&ldquo;</span>
      {es
        ? 'Pasamos de revisar 200 CVs por semana a tener entrevistas grabadas listas para revisar. La calidad de las contrataciones subió, no bajó.'
        : 'We went from sifting 200 CVs a week to having recorded interviews ready to review. Hiring quality went up, not down.'}
      <span className="text-white/60">&rdquo;</span>
    </motion.blockquote>
  );
}

/* ─────────────────────────────────────────────────────────────
   SUPPORTING TESTIMONIALS
   ───────────────────────────────────────────────────────────── */
export function SupportingTestimonials() {
  const { language } = useAppStore();
  const es = language === 'es';

  const testimonials = [
    {
      quote: es
        ? 'Implementamos Reclutify en Monterrey y redujimos el tiempo de contratación 60%. La rúbrica elimina el sesgo de la primera ronda.'
        : 'We rolled out Reclutify in Monterrey and cut hiring time by 60%. The rubric removes first-round bias.',
      name: 'Ana García Morales',
      title: es ? 'Dir. de Capital Humano' : 'HR Director',
      company: es ? 'Manufactura · Monterrey' : 'Manufacturing · Monterrey',
    },
    {
      quote: es
        ? 'Evaluamos +200 candidatos al mes. Cada uno recibe la misma experiencia, sin importar la hora o la sucursal.'
        : 'We evaluate 200+ candidates monthly. Everyone gets the same experience, regardless of time or location.',
      name: 'Roberto Méndez',
      title: es ? 'VP de Personas' : 'VP of People',
      company: es ? 'Retail · CDMX' : 'Retail · Mexico City',
    },
    {
      quote: es
        ? 'Como startup, necesitábamos algo ágil y económico. Reclutify nos dio nivel enterprise por una fracción del costo.'
        : 'As a startup, we needed something agile and affordable. Reclutify gave us enterprise level at a fraction of the cost.',
      name: 'Valentina Ospina',
      title: 'Head of Talent',
      company: es ? 'Tech · Bogotá' : 'Tech · Bogotá',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
      {testimonials.map((q, i) => (
        <motion.figure
          key={i}
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6, delay: i * 0.08 }}
          className="border-t border-white/[0.08] pt-8"
        >
          <blockquote className="text-[15px] lg:text-[16px] text-white/75 leading-[1.65] mb-8">
            {q.quote}
          </blockquote>
          <figcaption>
            <div className="text-white text-[14px]">{q.name}</div>
            <div className="text-white/60 text-[13px] mt-0.5">
              {q.title} · {q.company}
            </div>
          </figcaption>
        </motion.figure>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   FINAL CTA — animated heading
   ───────────────────────────────────────────────────────────── */
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
export function OpenRolesSection() {
  const { roles } = useAdminStore();
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section id="roles" className="px-6 lg:px-8 py-32 lg:py-44">
      <div className="max-w-[1320px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16 lg:mb-20">
          <div className="max-w-[640px]">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-8">
              {es ? 'Posiciones abiertas' : 'Now hiring'}
            </div>
            <h2 className="font-serif font-normal text-[40px] lg:text-[72px] leading-[0.98] tracking-[-0.025em] text-white">
              {t.openPositions}
            </h2>
          </div>
          <p className="text-white/60 text-[15px] lg:text-[16px] max-w-sm">{t.viewOpenRoles}</p>
        </div>

        {roles.length === 0 ? (
          <div className="border border-white/[0.07] rounded-2xl py-20 px-8 text-center">
            <Briefcase className="h-6 w-6 text-white/25 mx-auto mb-5" />
            <p className="text-white/60 text-[15px]">{t.noRoles}</p>
          </div>
        ) : (
          <ul className="border-t border-white/[0.08]">
            {roles.map((role) => {
              const isOpen = expandedId === role.id;
              return (
                <li
                  key={role.id}
                  className="border-b border-white/[0.06] hover:bg-white/[0.015] transition-colors"
                >
                  <button
                    onClick={() => setExpandedId(isOpen ? null : role.id)}
                    className="w-full py-8 lg:py-10 px-2 text-left grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-8 md:items-center"
                  >
                    <div>
                      <h3 className="font-serif font-normal text-[24px] lg:text-[34px] leading-[1.1] tracking-[-0.015em] text-white mb-3.5">
                        {role.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/60">
                        {role.location && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" />
                            {role.location}
                          </span>
                        )}
                        {role.salary && (
                          <span className="inline-flex items-center gap-1.5">
                            <DollarSign className="w-3.5 h-3.5" />
                            {role.salary}
                          </span>
                        )}
                        {role.jobType && (
                          <span className="inline-flex items-center gap-1.5">
                            <Briefcase className="w-3.5 h-3.5" />
                            {role.jobType}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(role.createdAt).toLocaleDateString(
                            language === 'es' ? 'es-ES' : 'en-US',
                            { year: 'numeric', month: 'short', day: 'numeric' }
                          )}
                        </span>
                        <span className="text-white/60">
                          {role.topics.length} {t.jobListings}
                        </span>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 text-[13px] text-white/60 shrink-0">
                      {isOpen ? t.viewLess : t.viewMore}
                      <ChevronDown
                        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && role.description && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <div className="pb-10 px-2 pr-4 lg:pr-12 text-white/65 text-[14px] lg:text-[15px] leading-[1.7] whitespace-pre-wrap max-w-4xl">
                          {role.description}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   COMPARISON TABLE — language-dependent
   ───────────────────────────────────────────────────────────── */
export function ComparisonTable() {
  const { language } = useAppStore();
  const t = dictionaries[language];

  const rows = [
    { feature: t.compPrice, us: t.compPriceUs, them: t.compPriceThem, type: 'text' as const, usWin: true },
    { feature: t.compSpanish, us: 'yes', them: 'limited', type: 'icon' as const, usWin: true },
    { feature: t.compSetup, us: t.compSetupUs, them: t.compSetupThem, type: 'text' as const, usWin: true },
    { feature: t.compJobBoard, us: 'yes', them: 'no', type: 'icon' as const, usWin: true },
    { feature: t.compBias, us: 'yes', them: 'yes', type: 'icon' as const, usWin: false },
    { feature: t.compSentiment, us: 'yes', them: 'no', type: 'icon' as const, usWin: true },
    { feature: t.compWebhooks, us: 'yes', them: 'yes', type: 'icon' as const, usWin: false },
  ];

  return (
    <div className="border-t border-white/[0.08]">
      <div className="grid grid-cols-[1.6fr_1fr_1fr] items-center py-5 px-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-white/60">
          {t.compFeature}
        </div>
        <div className="text-center text-[13px] text-white font-medium">Reclutify</div>
        <div className="text-center text-[13px] text-white/60">HireVue</div>
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[1.6fr_1fr_1fr] items-center text-[14px] border-t border-white/[0.05] py-5 px-2"
        >
          <div className="text-white/75">{row.feature}</div>
          <div className="text-center">
            {row.type === 'icon' ? (
              row.us === 'yes' ? (
                <Check className="w-4 h-4 text-white inline" strokeWidth={2.5} />
              ) : (
                <Minus className="w-4 h-4 text-white/60 inline" />
              )
            ) : (
              <span className={row.usWin ? 'text-white' : 'text-white/60'}>{row.us}</span>
            )}
          </div>
          <div className="text-center text-white/60">
            {row.type === 'icon' ? (
              row.them === 'yes' ? (
                <Check className="w-4 h-4 text-white/60 inline" strokeWidth={2} />
              ) : row.them === 'limited' ? (
                <Minus className="w-4 h-4 text-white/60 inline" />
              ) : (
                <span className="text-white/25 text-lg leading-none">·</span>
              )
            ) : (
              row.them
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   PRODUCT SECTION — language-dependent text
   ───────────────────────────────────────────────────────────── */
export function ProductSection() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start">
      <div className="lg:col-span-5">
        <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-8">
          {es ? 'El por qué' : 'The why'}
        </div>
        <h2 className="font-serif font-normal text-[40px] lg:text-[64px] leading-[1] tracking-[-0.025em] text-white">
          {es ? (
            <>
              Menos llamadas.
              <br />
              <em className="font-serif italic text-white/55">Más señal.</em>
            </>
          ) : (
            <>
              Fewer calls.
              <br />
              <em className="font-serif italic text-white/55">More signal.</em>
            </>
          )}
        </h2>
      </div>
      <div className="lg:col-span-7 space-y-6 text-white/70 text-[17px] lg:text-[19px] leading-[1.6]">
        <p>
          {es
            ? 'Reemplazamos las primeras horas de filtrado con una conversación de 4 a 30 minutos que los candidatos disfrutan — y un reporte que tu equipo realmente lee.'
            : 'We replace the first hours of screening with a 4 to 30-minute conversation candidates enjoy — and a report your team actually reads.'}
        </p>
        <p className="text-white/60">
          {es
            ? 'Cada entrevista se evalúa con la misma rúbrica, en el mismo orden, sin sesgo de fatiga ni "química". Solo señal.'
            : 'Every interview is scored against the same rubric, in the same order, with no fatigue bias and no "vibes". Just signal.'}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   HOW IT WORKS HEADING — language-dependent
   ───────────────────────────────────────────────────────────── */
export function HowItWorksHeading() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 mb-20 lg:mb-28">
      <div className="max-w-[640px]">
        <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-8">
          {es ? 'Tres pasos' : 'Three steps'}
        </div>
        <h2 className="font-serif font-normal text-[40px] lg:text-[72px] leading-[0.98] tracking-[-0.025em] text-white">
          {es ? (
            <>
              Tan simple como
              <br />
              <em className="font-serif italic text-white/55">debería ser.</em>
            </>
          ) : (
            <>
              As simple as
              <br />
              <em className="font-serif italic text-white/55">it should be.</em>
            </>
          )}
        </h2>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   SPLIT SECTION HEADING — language-dependent
   ───────────────────────────────────────────────────────────── */
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
export function TestimonialHeading() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-12">
      {es ? 'Lo que dicen' : 'On the record'}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TESTIMONIAL ATTRIBUTION — language-dependent
   ───────────────────────────────────────────────────────────── */
export function TestimonialAttribution() {
  const { language } = useAppStore();
  const es = language === 'es';

  return (
    <div className="mt-12 lg:mt-16 flex items-center gap-4">
      <img
        src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=120"
        alt=""
        className="w-12 h-12 rounded-full object-cover grayscale opacity-90"
      />
      <div>
        <div className="text-white text-[14px]">Sarah Jenkins</div>
        <div className="text-white/60 text-[13px]">
          {es ? 'VP de Adquisición de Talento' : 'VP of Talent Acquisition'}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   COMPARISON HEADING — language-dependent
   ───────────────────────────────────────────────────────────── */
export function ComparisonHeading() {
  const { language } = useAppStore();
  const t = dictionaries[language];
  const es = language === 'es';

  return (
    <>
      <div className="text-[11px] uppercase tracking-[0.22em] text-white/60 mb-8">
        {es ? 'Comparativa' : 'Compared'}
      </div>
      <h2 className="font-serif font-normal text-[40px] lg:text-[64px] leading-[1.02] tracking-[-0.025em] text-white mb-4 max-w-[18ch]">
        {t.comparisonTitle}
      </h2>
      <p className="text-white/60 text-[16px] lg:text-[17px] mb-16 max-w-xl">
        {t.comparisonSub}
      </p>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   TRUSTED LOGOS HEADING — language-dependent
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
