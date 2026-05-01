'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { Briefcase, ArrowRight, Clock, MapPin, DollarSign, ChevronDown, ArrowUpRight, Zap, Target, LineChart, MessageSquare, Check, X, Sparkles, Shield, UserSearch, Building2 } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LanguageToggle from '@/components/ui/LanguageToggle';
import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';

// Marquee Logos (SVG placeholders for trusted companies)
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

export default function JobBoardPage() {
  const { roles } = useAdminStore();
  const { language } = useAppStore();
  const t = dictionaries[language];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 150]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  return (
    <div className="min-h-screen bg-[#1a1b23] text-white flex flex-col font-sans selection:bg-[#D3FB52] selection:text-black overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#1a1b23]/80 backdrop-blur-xl">
        <Logo />
        <div className="flex items-center gap-4">
          <LanguageToggle />
          <Link
            href="/practice"
            className="hidden md:inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-sm text-neutral-300 hover:text-white transition-colors"
          >
            {t.practiceNav}
          </Link>
          <Link
            href="/pricing"
            className="hidden md:inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-sm text-neutral-300 hover:text-white transition-colors"
          >
            {language === 'es' ? 'Precios' : 'Pricing'}
          </Link>
          <Link
            href="/login"
            className="hidden md:inline-flex items-center justify-center px-4 py-2 rounded-lg font-medium text-sm border border-white/20 hover:border-white/40 transition-colors"
          >
            Log in
          </Link>
          <Link
            href="/login?tab=register&role=candidate"
            className="hidden md:inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm bg-[#00D3D8]/15 text-[#00D3D8] border border-[#00D3D8]/30 hover:bg-[#00D3D8]/25 transition-colors"
          >
            <UserSearch className="w-4 h-4" />
            {t.ctaSeekJob}
          </Link>
          <Link
            href="/login?tab=register&role=employer"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-medium text-sm bg-[#D3FB52] text-black hover:bg-[#c1e847] transition-colors"
          >
            <Building2 className="w-4 h-4" />
            {t.ctaPostJob}
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full mx-auto pb-24">
        {/* Dynamic Hero Section */}
        <section className="px-4 md:px-6 pt-24 pb-12 max-w-[1400px] mx-auto w-full">
          {/* Hero Video Container */}
          <div className="relative w-full h-[60vh] md:h-[75vh] rounded-[2rem] overflow-hidden mb-6 flex flex-col items-center justify-center">
            {/* Background Video */}
            <video 
              src="/hero.mp4" 
              autoPlay 
              loop 
              muted 
              playsInline 
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Dark Overlay for Text Readability */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Centered Massive Text */}
            <motion.div 
              style={{ y: heroY, opacity: heroOpacity }}
              className="relative z-10 flex flex-col items-center justify-center text-center w-full pointer-events-none"
            >
              <motion.h1 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="text-[18vw] md:text-[140px] lg:text-[160px] leading-[0.8] font-bold uppercase tracking-tighter text-[#F2F0E6]"
                style={{ fontFamily: "'Impact', 'Arial Black', sans-serif" }}
              >
                {t.heroTitle}
              </motion.h1>
              <motion.h1 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
                className="text-[18vw] md:text-[140px] lg:text-[160px] leading-[0.8] font-bold uppercase tracking-tighter text-[#F2F0E6]"
                style={{ fontFamily: "'Impact', 'Arial Black', sans-serif" }}
              >
                {t.heroSub}
              </motion.h1>
            </motion.div>
          </div>

          {/* Action Buttons Row */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
             <a href="#roles" className="group flex items-center justify-between px-6 py-5 rounded-2xl border border-[#323346] hover:border-[#D3FB52] hover:bg-white/5 transition-all bg-[#1a1b23]">
               <span className="text-[#D3FB52] font-semibold text-lg">{t.ctaFindJob}</span>
               <ArrowRight className="w-5 h-5 text-[#D3FB52] opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
             </a>
             <Link href="/admin/pipeline" className="group flex items-center justify-between px-6 py-5 rounded-2xl border border-[#323346] hover:border-[#D3FB52] hover:bg-white/5 transition-all bg-[#1a1b23]">
               <span className="text-[#D3FB52] font-semibold text-lg">{t.ctaAI}</span>
               <ArrowRight className="w-5 h-5 text-[#D3FB52] opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
             </Link>
             <Link href="/admin" className="group flex items-center justify-between px-6 py-5 rounded-2xl border border-[#323346] hover:border-[#D3FB52] hover:bg-white/5 transition-all bg-[#1a1b23]">
               <span className="text-[#D3FB52] font-semibold text-lg">{t.ctaHireNow}</span>
               <ArrowRight className="w-5 h-5 text-[#D3FB52] opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
             </Link>
             <a href="#" className="group flex items-center justify-between px-6 py-5 rounded-2xl border border-[#323346] hover:border-[#D3FB52] hover:bg-white/5 transition-all bg-[#1a1b23]">
               <span className="text-[#D3FB52] font-semibold text-lg">{t.ctaTrainModel}</span>
               <ArrowRight className="w-5 h-5 text-[#D3FB52] opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
             </a>
          </motion.div>
        </section>

        {/* Stats Band */}
        <section className="border-y border-white/10 bg-white/5 py-12 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
              <motion.div whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} viewport={{ once: true }} className="flex flex-col items-center">
                 <div className="text-4xl lg:text-5xl font-bold text-white mb-2">10K+</div>
                 <div className="text-[#D3FB52] font-medium text-lg uppercase tracking-wider">{t.statEmployers}</div>
              </motion.div>
              <motion.div whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} viewport={{ once: true }} transition={{ delay: 0.1 }} className="flex flex-col items-center pt-8 md:pt-0">
                 <div className="text-4xl lg:text-5xl font-bold text-white mb-2">1M+</div>
                 <div className="text-[#D3FB52] font-medium text-lg uppercase tracking-wider">{t.statCandidates}</div>
              </motion.div>
              <motion.div whileInView={{ opacity: 1, y: 0 }} initial={{ opacity: 0, y: 20 }} viewport={{ once: true }} transition={{ delay: 0.2 }} className="flex flex-col items-center pt-8 md:pt-0">
                 <div className="text-4xl lg:text-5xl font-bold text-white mb-2">500K+</div>
                 <div className="text-[#D3FB52] font-medium text-lg uppercase tracking-wider">{t.statInterviews}</div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Marquee Logos */}
        <section className="py-20 overflow-hidden bg-[#1a1b23]">
          <div className="text-center text-sm font-medium uppercase tracking-widest text-neutral-500 mb-10">
            {t.trustedBy}
          </div>
          <div className="w-full flex overflow-hidden mask-image-fade">
             <motion.div 
               animate={{ x: ["0%", "-50%"] }} 
               transition={{ ease: "linear", duration: 40, repeat: Infinity }}
               className="flex flex-nowrap items-center gap-16 md:gap-24 opacity-50 hover:opacity-100 transition-opacity"
             >
                {[...trustedLogos, ...trustedLogos].map((logo, i) => (
                  <img 
                    key={i} 
                    src={logo.src} 
                    alt={logo.name} 
                    className="h-10 md:h-12 w-auto object-contain brightness-0 invert" 
                  />
                ))}
             </motion.div>
          </div>
        </section>

        {/* Bento Hover Cards - Handshake Style */}
        <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
             
             {/* Card 1: Job Seekers */}
             <motion.a whileHover={{ y: -8 }} href="#roles" className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-8 aspect-square lg:aspect-auto lg:h-[500px] bg-[#d6faff] text-[#052326] transition-transform">
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10 flex flex-col gap-4">
                   <div className="px-3 py-1 rounded-full border border-[#052326]/20 w-fit text-sm font-medium tracking-wide">
                     {t.card1Mini}
                   </div>
                   <h2 className="text-3xl lg:text-4xl font-bold leading-tight max-w-xs transition-transform duration-300 group-hover:-translate-y-2">
                     {t.card1Title}
                   </h2>
                </div>
                <div className="relative z-10 mt-auto flex justify-between items-end opacity-0 transform translate-y-8 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                   <div className="bg-[#052326] text-white p-4 rounded-full">
                     <ArrowUpRight className="w-6 h-6" />
                   </div>
                </div>
             </motion.a>

             {/* Card 2: Recruiters */}
             <motion.a whileHover={{ y: -8 }} href="/admin" className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-8 aspect-square lg:aspect-auto lg:h-[500px] bg-[#f1feca] text-[#052326] transition-transform">
                <div className="relative z-10 flex flex-col gap-4">
                   <div className="px-3 py-1 rounded-full border border-[#052326]/20 w-fit text-sm font-medium tracking-wide">
                     {t.card2Mini}
                   </div>
                   <h2 className="text-3xl lg:text-4xl font-bold leading-tight max-w-xs transition-transform duration-300 group-hover:-translate-y-2">
                     {t.card2Title}
                   </h2>
                </div>
                <div className="relative z-10 mt-auto flex justify-between items-end opacity-0 transform translate-y-8 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                   <div className="bg-[#052326] text-white p-4 rounded-full">
                     <ArrowUpRight className="w-6 h-6" />
                   </div>
                </div>
             </motion.a>

             {/* Card 3: AI Interviews */}
             <motion.div whileHover={{ y: -8 }} className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-8 aspect-square lg:aspect-auto lg:h-[500px] bg-[#eaebf8] text-[#052326] transition-transform">
                <div className="relative z-10 flex flex-col gap-4">
                   <div className="px-3 py-1 rounded-full border border-[#052326]/20 w-fit text-sm font-medium tracking-wide flex items-center gap-2">
                     <Zap className="w-4 h-4" /> {t.card3Mini}
                   </div>
                   <h2 className="text-3xl lg:text-4xl font-bold leading-tight max-w-xs transition-transform duration-300 group-hover:-translate-y-2">
                     {t.card3Title}
                   </h2>
                </div>
                <div className="relative z-10 mt-auto flex justify-between items-end opacity-0 transform translate-y-8 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                   <div className="bg-[#052326] text-white p-4 rounded-full">
                     <ArrowUpRight className="w-6 h-6" />
                   </div>
                </div>
             </motion.div>

             {/* Card 4: Analytics */}
             <motion.div whileHover={{ y: -8 }} className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-8 aspect-square lg:aspect-auto lg:h-[500px] bg-[#f4e6ff] text-[#052326] transition-transform">
                <div className="relative z-10 flex flex-col gap-4">
                   <div className="px-3 py-1 rounded-full border border-[#052326]/20 w-fit text-sm font-medium tracking-wide flex items-center gap-2">
                     <LineChart className="w-4 h-4" /> {t.card4Mini}
                   </div>
                   <h2 className="text-3xl lg:text-4xl font-bold leading-tight max-w-xs transition-transform duration-300 group-hover:-translate-y-2">
                     {t.card4Title}
                   </h2>
                </div>
                <div className="relative z-10 mt-auto flex justify-between items-end opacity-0 transform translate-y-8 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                   <div className="bg-[#052326] text-white p-4 rounded-full">
                     <ArrowUpRight className="w-6 h-6" />
                   </div>
                </div>
             </motion.div>

          </div>
        </section>

        {/* --- Role Split CTA Section --- */}
        <section className="py-24 px-4 md:px-8 max-w-[1400px] mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight mb-4">
              {language === 'es' ? '¿Qué estás buscando?' : 'What are you looking for?'}
            </h2>
            <p className="text-lg text-neutral-400 max-w-2xl mx-auto">
              {language === 'es'
                ? 'Elige tu camino y empieza en menos de 2 minutos'
                : 'Choose your path and get started in under 2 minutes'}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Card: Candidate */}
            <motion.div
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Link
                href="/login?tab=register&role=candidate"
                className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-8 md:p-10 min-h-[380px] bg-[#d6faff] text-[#052326] transition-transform"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#00D3D8]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-[#052326]/10 flex items-center justify-center">
                      <UserSearch className="w-6 h-6" />
                    </div>
                    <span className="px-3 py-1 rounded-full border border-[#052326]/20 text-sm font-medium tracking-wide">
                      {t.roleSplitBadgeCandidate}
                    </span>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-bold leading-tight mb-3 transition-transform duration-300 group-hover:-translate-y-1">
                    {t.roleSplitTitleCandidate}
                  </h3>
                  <p className="text-[#052326]/70 text-base leading-relaxed mb-6 max-w-md">
                    {t.roleSplitSubCandidate}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-8">
                    {t.roleSplitFeaturesCandidate.map((feat: string, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#052326]/5 border border-[#052326]/10 text-xs font-medium">
                        <Check className="w-3 h-3 text-[#00D3D8]" />
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative z-10 flex items-center justify-between">
                  <span className="text-lg font-bold group-hover:text-[#00D3D8] transition-colors">
                    {t.roleSplitCtaCandidate}
                  </span>
                  <div className="bg-[#052326] text-white p-4 rounded-full opacity-0 transform translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <ArrowUpRight className="w-6 h-6" />
                  </div>
                </div>
              </Link>
            </motion.div>

            {/* Card: Employer */}
            <motion.div
              whileHover={{ y: -8 }}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Link
                href="/login?tab=register&role=employer"
                className="group relative flex flex-col justify-between overflow-hidden rounded-[32px] p-8 md:p-10 min-h-[380px] bg-[#f1feca] text-[#052326] transition-transform"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#D3FB52]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 rounded-2xl bg-[#052326]/10 flex items-center justify-center">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <span className="px-3 py-1 rounded-full border border-[#052326]/20 text-sm font-medium tracking-wide">
                      {t.roleSplitBadgeEmployer}
                    </span>
                  </div>
                  <h3 className="text-3xl lg:text-4xl font-bold leading-tight mb-3 transition-transform duration-300 group-hover:-translate-y-1">
                    {t.roleSplitTitleEmployer}
                  </h3>
                  <p className="text-[#052326]/70 text-base leading-relaxed mb-6 max-w-md">
                    {t.roleSplitSubEmployer}
                  </p>
                  <div className="flex flex-wrap gap-2 mb-8">
                    {t.roleSplitFeaturesEmployer.map((feat: string, i: number) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#052326]/5 border border-[#052326]/10 text-xs font-medium">
                        <Check className="w-3 h-3 text-[#D3FB52]" />
                        {feat}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="relative z-10 flex items-center justify-between">
                  <span className="text-lg font-bold group-hover:text-[#3d7a02] transition-colors">
                    {t.roleSplitCtaEmployer}
                  </span>
                  <div className="bg-[#052326] text-white p-4 rounded-full opacity-0 transform translate-y-4 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
                    <ArrowUpRight className="w-6 h-6" />
                  </div>
                </div>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* --- NEW: How It Works Section --- */}
        <section className="py-24 px-6 md:px-12 max-w-[1400px] mx-auto">
          <div className="mb-20 text-center">
            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-4">
              {language === 'es' ? '¿Cómo funciona WorldBrain?' : 'How WorldBrain Works'}
            </h2>
            <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
              {language === 'es' 
                ? 'El proceso de reclutamiento más avanzado, simplificado en tres pasos.' 
                : 'The most advanced recruiting process, simplified in three steps.'}
            </p>
          </div>

          <div className="space-y-32">
            {/* Step 1 */}
            <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-24">
              <div className="w-full md:w-1/2 order-2 md:order-1 relative">
                <div className="absolute -inset-4 bg-[#D3FB52]/10 rounded-3xl blur-2xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5" />
                <img 
                  src="/stock_recruiting.png" 
                  alt="Dashboard Platform" 
                  className="relative z-10 w-full rounded-[2rem] border border-white/10 shadow-2xl object-cover aspect-[4/3] bg-[#1a1b23]"
                />
              </div>
              <div className="w-full md:w-1/2 order-1 md:order-2">
                <div className="w-14 h-14 rounded-full bg-[#D3FB52]/20 flex items-center justify-center text-[#D3FB52] font-bold text-2xl mb-6">1</div>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
                  {language === 'es' ? 'Crea y Configura tu Vacante' : 'Create and Configure your Role'}
                </h3>
                <p className="text-lg text-neutral-400 leading-relaxed">
                  {language === 'es' 
                    ? 'Define los requisitos, genera un rubro de evaluación con IA basado en tu descripción y lanza la convocatoria en minutos. Obtén un enlace único para tus candidatos.' 
                    : 'Define requirements, generate an AI evaluation rubric based on your description, and launch the role in minutes. Get a unique link for your candidates.'}
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-24">
              <div className="w-full md:w-1/2">
                <div className="w-14 h-14 rounded-full bg-[#D3FB52]/20 flex items-center justify-center text-[#D3FB52] font-bold text-2xl mb-6">2</div>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
                  {language === 'es' ? 'Entrevistas Autónomas con Zara' : 'Autonomous Interviews with Zara'}
                </h3>
                <p className="text-lg text-neutral-400 leading-relaxed">
                  {language === 'es' 
                    ? 'Tus candidatos interactúan en tiempo real con nuestra entrevistadora IA, Zara. Ella hace preguntas adaptativas, analiza las respuestas en profundidad y evalúa habilidades blandas y duras.' 
                    : 'Your candidates interact in real-time with our AI interviewer, Zara. She asks adaptive questions, deeply analyzes answers, and evaluates both hard and soft skills.'}
                </p>
              </div>
              <div className="w-full md:w-1/2 relative">
                <div className="absolute -inset-4 bg-[#00D3D8]/10 rounded-3xl blur-2xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5" />
                <img 
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=1000" 
                  alt="Candidate Interview" 
                  className="relative z-10 w-full rounded-[2rem] border border-white/10 shadow-2xl object-cover aspect-[4/3] bg-[#1a1b23]"
                />
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex flex-col md:flex-row items-center gap-12 lg:gap-24">
              <div className="w-full md:w-1/2 order-2 md:order-1 relative">
                <div className="absolute -inset-4 bg-[#b56afa]/10 rounded-3xl blur-2xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4/5 h-4/5" />
                <img 
                  src="https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&q=80&w=1000" 
                  alt="Team Analytics" 
                  className="relative z-10 w-full rounded-[2rem] border border-white/10 shadow-2xl object-cover aspect-[4/3] bg-[#1a1b23]"
                />
              </div>
              <div className="w-full md:w-1/2 order-1 md:order-2">
                <div className="w-14 h-14 rounded-full bg-[#D3FB52]/20 flex items-center justify-center text-[#D3FB52] font-bold text-2xl mb-6">3</div>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
                  {language === 'es' ? 'Toma Decisiones con Datos' : 'Make Data-Driven Decisions'}
                </h3>
                <p className="text-lg text-neutral-400 leading-relaxed">
                  {language === 'es' 
                    ? 'Accede a un dashboard completo con métricas de desempeño, transcripciones de video, pros, contras y una recomendación final de la IA para contratar al mejor talento.' 
                    : 'Access a comprehensive dashboard with performance metrics, video transcripts, pros, cons, and a final AI recommendation to hire the best talent.'}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* --- NEW: Testimonials Section --- */}
        <section className="py-24 px-6 relative mt-12">
          <div className="absolute inset-0 bg-white/[0.02] border-y border-white/5 pointer-events-none" />
          <div className="relative max-w-7xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-16">
              {language === 'es' ? 'Lo que dicen los líderes de HR' : 'What HR Leaders Are Saying'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
              {[
                {
                  quote: language === 'es' ? '"WorldBrain nos ahorró más de 40 horas semanales en la primera fase de filtrado. La calidad de los candidatos que llegan a la entrevista final es increíblemente superior."' : '"WorldBrain saved us over 40 hours a week in the initial screening phase. The quality of candidates reaching the final interview is incredibly superior."',
                  name: "Sarah Jenkins",
                  title: "VP of Talent Acquisition",
                  img: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=150"
                },
                {
                  quote: language === 'es' ? '"La IA Zara es sorprendentemente natural. Nuestros prospectos amaron la flexibilidad de hacer la entrevista a cualquier hora, y nosotros amamos los reportes automáticos."' : '"The Zara AI is surprisingly natural. Our prospects loved the flexibility of doing the interview at any time, and we loved the automated reports."',
                  name: "Carlos Rivera",
                  title: "HR Director TechSolutions",
                  img: "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=150"
                },
                {
                  quote: language === 'es' ? '"El análisis de sentimientos y la estructuración del puntaje por tema nos permite tomar decisiones basadas 100% en datos y sin sesgos humanos. El futuro del reclutamiento está aquí."' : '"Sentiment analysis and topic-based score structuring allows us to make 100% data-driven decisions without human bias. The future of recruiting is here."',
                  name: "Emily Chen",
                  title: "Head of People",
                  img: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=150"
                }
              ].map((testimonial, i) => (
                <div key={i} className="bg-[#1a1b23] border border-white/10 rounded-3xl p-8 flex flex-col justify-between shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 text-6xl text-white/5 font-serif leading-none">"</div>
                  <p className="text-neutral-300 leading-relaxed mb-8 relative z-10 text-lg">
                    {testimonial.quote}
                  </p>
                  <div className="flex items-center gap-4 relative z-10">
                    <img src={testimonial.img} alt={testimonial.name} className="w-12 h-12 rounded-full object-cover border border-white/20" />
                    <div>
                      <h4 className="text-white font-medium">{testimonial.name}</h4>
                      <p className="text-[#D3FB52] text-sm">{testimonial.title}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Module 6: Zara Habla Español Section --- */}
        <section className="py-24 px-6 relative">
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-col lg:flex-row items-center gap-16">
              {/* Left: Info */}
              <div className="flex-1">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D3FB52]/10 border border-[#D3FB52]/20 text-[#D3FB52] text-xs font-semibold uppercase tracking-wider mb-6">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {language === 'es' ? 'Bilingüe Nativo' : 'Native Bilingual'}
                  </div>
                  <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                    {t.zaraHablaTitle}
                  </h2>
                  <p className="text-lg text-neutral-400 leading-relaxed mb-8">
                    {t.zaraHablaSub}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
                      <span className="text-xl">🇲🇽</span>
                      <span className="text-neutral-300">México</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
                      <span className="text-xl">🇨🇴</span>
                      <span className="text-neutral-300">Colombia</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
                      <span className="text-xl">🇪🇸</span>
                      <span className="text-neutral-300">España</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
                      <span className="text-xl">🇨🇱</span>
                      <span className="text-neutral-300">Chile</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm">
                      <span className="text-xl">🇦🇷</span>
                      <span className="text-neutral-300">Argentina</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Right: Mock Chat Demo */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="flex-1 w-full max-w-lg"
              >
                <div className="bg-[#0e0f14] rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#D3FB52]/20 flex items-center justify-center">
                      <Sparkles className="w-4 h-4 text-[#D3FB52]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Zara AI</p>
                      <p className="text-[10px] text-neutral-500">{t.zaraDemo}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                      <span className="text-[10px] text-success">Live</span>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Zara message */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#D3FB52]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#D3FB52]" />
                      </div>
                      <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-neutral-300 leading-relaxed max-w-[85%]">
                        ¡Hola! Soy Zara, tu entrevistadora de IA. Cuéntame sobre tu experiencia liderando equipos de desarrollo y cómo manejas los conflictos internos.
                      </div>
                    </div>
                    {/* Candidate reply */}
                    <div className="flex gap-3 flex-row-reverse">
                      <div className="w-7 h-7 rounded-full bg-[#00D3D8]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-[#00D3D8]">MR</span>
                      </div>
                      <div className="bg-[#00D3D8]/10 rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-neutral-300 leading-relaxed max-w-[85%]">
                        En mi último rol, lideré un equipo de 12 desarrolladores. Cuando surgían conflictos, siempre priorizaba reuniones 1:1 para entender las perspectivas...
                      </div>
                    </div>
                    {/* Zara follow up */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#D3FB52]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#D3FB52]" />
                      </div>
                      <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-neutral-300 leading-relaxed max-w-[85%]">
                        Excelente enfoque. ¿Podrías darme un ejemplo específico donde esas reuniones 1:1 resolvieron un conflicto técnico?
                      </div>
                    </div>
                    {/* Typing indicator */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#00D3D8]/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-[#00D3D8]">MR</span>
                      </div>
                      <div className="bg-[#00D3D8]/10 rounded-2xl rounded-tr-sm px-3 py-3">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* --- Module 6: Comparison Table Reclutify vs HireVue --- */}
        <section className="py-24 px-6 relative">
          <div className="absolute inset-0 bg-white/[0.02] border-y border-white/5 pointer-events-none" />
          <div className="relative max-w-4xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                {t.comparisonTitle}
              </h2>
              <p className="text-lg text-neutral-400">
                {t.comparisonSub}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl border border-white/10 overflow-hidden shadow-2xl"
            >
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left px-6 py-5 text-sm font-medium text-neutral-400 uppercase tracking-wider">{t.compFeature}</th>
                    <th className="text-center px-6 py-5">
                      <span className="text-sm font-bold text-[#D3FB52]">Reclutify</span>
                    </th>
                    <th className="text-center px-6 py-5">
                      <span className="text-sm font-medium text-neutral-400">HireVue</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {[
                    { feature: t.compPrice, us: t.compPriceUs, them: t.compPriceThem, usWin: true },
                    { feature: t.compSpanish, us: t.yes, them: t.limited, usWin: true },
                    { feature: t.compSetup, us: t.compSetupUs, them: t.compSetupThem, usWin: true },
                    { feature: t.compJobBoard, us: t.yes, them: t.no, usWin: true },
                    { feature: t.compBias, us: t.yes, them: t.yes, usWin: false },
                    { feature: t.compSentiment, us: t.yes, them: t.no, usWin: true },
                    { feature: t.compWebhooks, us: t.yes, them: t.yes, usWin: false },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-6 py-4 text-sm text-neutral-300 font-medium">{row.feature}</td>
                      <td className="text-center px-6 py-4">
                        <span className={`text-sm font-semibold ${row.usWin ? 'text-[#D3FB52]' : 'text-neutral-300'}`}>
                          {row.us}
                        </span>
                      </td>
                      <td className="text-center px-6 py-4">
                        <span className="text-sm text-neutral-500">{row.them}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>
          </div>
        </section>

        {/* --- Module 6: Hispanic Testimonials --- */}
        <section className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-3xl md:text-4xl font-bold text-white text-center mb-16"
            >
              {language === 'es' ? 'Líderes de LATAM confían en Reclutify' : 'LATAM Leaders Trust Reclutify'}
            </motion.h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  quote: language === 'es' 
                    ? '"Implementamos Reclutify en nuestra planta de Monterrey y redujimos el tiempo de contratación en un 60%. La evaluación por IA elimina el sesgo que teníamos en las primeras rondas."'
                    : '"We implemented Reclutify at our Monterrey plant and reduced hiring time by 60%. AI evaluation eliminates the bias we had in early rounds."',
                  name: 'Ana García Morales',
                  title: language === 'es' ? 'Dir. de Capital Humano' : 'HR Director',
                  company: language === 'es' ? 'Manufactura — Monterrey 🇲🇽' : 'Manufacturing — Monterrey 🇲🇽',
                },
                {
                  quote: language === 'es'
                    ? '"Nuestro equipo de tiendas evalúa +200 candidatos al mes. Con Reclutify, cada uno recibe la misma experiencia profesional sin importar la hora o sucursal."'
                    : '"Our store team evaluates 200+ candidates monthly. With Reclutify, each one gets the same professional experience regardless of time or location."',
                  name: 'Roberto Méndez',
                  title: language === 'es' ? 'VP de Personas' : 'VP of People',
                  company: language === 'es' ? 'Retail — CDMX 🇲🇽' : 'Retail — Mexico City 🇲🇽',
                },
                {
                  quote: language === 'es'
                    ? '"Como startup en Bogotá, necesitábamos algo ágil y económico. Reclutify nos dio entrevistas con IA de nivel enterprise por una fracción del costo de HireVue."'
                    : '"As a Bogotá startup, we needed something agile and affordable. Reclutify gave us enterprise-level AI interviews at a fraction of HireVue\'s cost."',
                  name: 'Valentina Ospina',
                  title: 'Head of Talent',
                  company: language === 'es' ? 'Tech — Bogotá 🇨🇴' : 'Tech — Bogotá 🇨🇴',
                },
                {
                  quote: language === 'es'
                    ? '"El reporte ejecutivo con riesgos de contratación y tips de onboarding nos sorprendió. Es como tener un consultor de HR senior en cada evaluación."'
                    : '"The executive report with hiring risks and onboarding tips surprised us. It\'s like having a senior HR consultant on every evaluation."',
                  name: 'Dr. Felipe Araya',
                  title: language === 'es' ? 'Dir. Médico RRHH' : 'Medical HR Director',
                  company: language === 'es' ? 'Salud — Santiago 🇨🇱' : 'Healthcare — Santiago 🇨🇱',
                },
                {
                  quote: language === 'es'
                    ? '"La detección de sesgos nos da tranquilidad regulatoria. En banca, la diversidad no es opcional — con Reclutify sabemos que cada candidato recibe un trato justo."'
                    : '"Bias detection gives us regulatory peace of mind. In banking, diversity isn\'t optional — with Reclutify we know every candidate gets fair treatment."',
                  name: 'María del Carmen Ruiz',
                  title: language === 'es' ? 'Directora de Talento' : 'Talent Director',
                  company: language === 'es' ? 'Finanzas — Madrid 🇪🇸' : 'Finance — Madrid 🇪🇸',
                },
              ].map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-[#0e0f14] border border-white/10 rounded-3xl p-7 flex flex-col justify-between hover:border-[#D3FB52]/20 transition-colors"
                >
                  <p className="text-neutral-300 leading-relaxed mb-6 text-sm">{t.quote}</p>
                  <div>
                    <p className="text-white font-medium text-sm">{t.name}</p>
                    <p className="text-[#D3FB52] text-xs">{t.title}</p>
                    <p className="text-neutral-500 text-xs mt-0.5">{t.company}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* --- Module 6: Urgency CTA Banner --- */}
        <section className="py-16 px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto relative overflow-hidden rounded-3xl"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-[#D3FB52]/20 via-[#00D3D8]/15 to-[#b56afa]/20" />
            <div className="absolute inset-0 bg-[#0e0f14]/80" />
            <div className="relative z-10 py-16 px-8 md:px-16 flex flex-col md:flex-row items-center justify-between gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-[#D3FB52]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#D3FB52]">🇲🇽 {language === 'es' ? 'Oferta Especial Latam' : 'Special Latam Offer'}</span>
                </div>
                <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                  {t.urgencyCta}
                </h3>
              </div>
              <Link
                href="/login"
                className="shrink-0 inline-flex items-center gap-2 bg-[#D3FB52] text-black font-bold px-8 py-4 rounded-xl hover:bg-[#c1e847] transition-colors text-base shadow-lg shadow-[#D3FB52]/20"
              >
                {t.urgencyBtn}
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </motion.div>
        </section>

        {/* --- NEW: What's New Section (Modules 6/7/8 additions) --- */}
        <section className="py-24 px-6 bg-[#D3FB52]/5 border-y border-[#D3FB52]/10 mt-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-[#D3FB52] rounded-full blur-[150px] opacity-10 translate-x-1/2 -translate-y-1/2" />
          <div className="relative max-w-7xl mx-auto">
            <div className="text-center mb-16">
               <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D3FB52]/10 border border-[#D3FB52]/20 text-[#D3FB52] text-xs font-semibold uppercase tracking-wider mb-4">
                 <Sparkles className="h-3.5 w-3.5" />
                 {language === 'es' ? 'Novedades v2.0' : 'What\'s New v2.0'}
               </div>
               <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
                 {language === 'es' ? 'Recientes Innovaciones' : 'Latest Innovations'}
               </h2>
               <p className="text-lg text-neutral-400">
                 {language === 'es' ? 'Incorporamos herramientas clave para un reclutamiento impecable y equitativo.' : 'We built key tools for a flawless and fair recruiting process.'}
               </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               {[
                 { title: language === 'es' ? 'Insights de Sesgo' : 'Bias Insights', desc: language === 'es' ? 'Analíticas de equidad y demografía para asegurar reclutamiento imparcial.' : 'Fairness and demographic analytics to ensure unbiased hiring.', icon: Shield },
                 { title: language === 'es' ? 'Scorecards en PDF' : 'PDF Scorecards', desc: language === 'es' ? 'Exporta el récord de entrevistas con retroalimentación automática al instante.' : 'Export the interview record with automatic feedback instantly.', icon: ArrowUpRight },
                 { title: language === 'es' ? 'Modo Feria Universitaria' : 'University Fair Mode', desc: language === 'es' ? 'Kioscos interactivos con QR para simulaciones masivas y captación en campus.' : 'Interactive QR kiosks for mass simulations and campus recruitment.', icon: Target },
               ].map((f, i) => (
                 <div key={i} className="bg-[#1a1b23] border border-white/10 rounded-3xl p-8 hover:border-[#D3FB52]/40 transition-colors shadow-xl">
                    <f.icon className="h-8 w-8 text-[#D3FB52] mb-6" />
                    <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
                    <p className="text-neutral-400 text-sm leading-relaxed">{f.desc}</p>
                 </div>
               ))}
            </div>
          </div>
        </section>

        {/* Existing Job Board Re-integrated at Bottom */}
        <section id="roles" className="py-24 px-6 relative">
          <div className="absolute inset-0 bg-white/5 rounded-[48px] mx-4 md:mx-8 pointer-events-none" />
          <div className="relative max-w-5xl w-full mx-auto">
            <div className="mb-16 text-center">
              <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 tracking-tight">
                {t.openPositions}
              </h1>
              <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
                {t.viewOpenRoles}
              </p>
            </div>

            {roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 bg-white/5 rounded-3xl border border-white/10 text-center shadow-lg">
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-6">
                  <Briefcase className="h-10 w-10 text-white" />
                </div>
                <h3 className="text-2xl font-medium text-white mb-2">{t.noRoles}</h3>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {roles.map((role, idx) => (
                  <motion.div
                    key={role.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className="group flex flex-col bg-white/5 backdrop-blur-sm rounded-[32px] border border-white/10 p-8 shadow-2xl hover:border-[#D3FB52]/40 hover:bg-white/10 transition-all duration-300 relative overflow-hidden"
                  >
                    <div className="absolute -inset-1 bg-gradient-to-r from-[#00D3D8] to-[#D3FB52] opacity-0 group-hover:opacity-20 blur transition-opacity duration-500" />
                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex items-start justify-between mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-[#D3FB52]/20 flex items-center justify-center text-[#D3FB52] group-hover:scale-110 transition-transform">
                          <Briefcase className="h-7 w-7" />
                        </div>
                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-black/40 border border-white/10 text-xs font-medium text-neutral-300">
                          <Clock className="h-3.5 w-3.5" />
                          {t.postedOn} {new Date(role.createdAt).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                        </span>
                      </div>

                      <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">
                        {role.title}
                      </h2>
                      
                      {/* Meta Tags */}
                      <div className="flex flex-wrap gap-2 mb-6">
                        {role.location && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm font-medium text-neutral-300 border border-white/5">
                            <MapPin className="h-4 w-4 text-[#D3FB52]" /> {role.location}
                          </span>
                        )}
                        {role.salary && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm font-medium text-neutral-300 border border-white/5">
                            <DollarSign className="h-4 w-4 text-[#D3FB52]" /> {role.salary}
                          </span>
                        )}
                        {role.jobType && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm font-medium text-neutral-300 border border-white/5">
                            <Briefcase className="h-4 w-4 text-[#D3FB52]" /> {role.jobType}
                          </span>
                        )}
                      </div>

                      {/* Topics summary */}
                      <p className="text-sm font-medium text-[#D3FB52] mb-6">
                        {role.topics.length} {t.jobListings}
                      </p>

                      {role.description && (
                        <div className="mb-8 flex-1 flex flex-col items-start w-full">
                          <button 
                            onClick={() => setExpandedId(expandedId === role.id ? null : role.id)}
                            className="text-white hover:text-[#D3FB52] text-sm font-semibold hover:underline flex items-center gap-1 transition-colors"
                          >
                            {expandedId === role.id ? t.viewLess : t.viewMore}
                            <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === role.id ? 'rotate-180' : ''}`} />
                          </button>
                          
                          <AnimatePresence>
                            {expandedId === role.id && (
                              <motion.div
                                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                                animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
                                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                                className="overflow-hidden w-full origin-top"
                              >
                                <div className="text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap bg-black/40 p-6 rounded-2xl border border-white/10">
                                  {role.description}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      <div className={!role.description ? 'mt-auto' : ''}>
                        <div
                          className="inline-flex flex-col items-center justify-center gap-2 w-full py-4 rounded-xl bg-white/5 border border-white/10 text-neutral-400 font-medium text-sm cursor-default"
                        >
                          <span className="text-[#D3FB52] text-lg">🎟️</span>
                          {language === 'es' ? 'Se requiere ticket de HR' : 'HR ticket required'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </section>

      </main>

      {/* --- NEW: Footer --- */}
      <footer className="bg-[#0b0c10] border-t border-white/5 pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-1 md:col-span-1">
              <Logo />
              <p className="text-neutral-400 text-sm mt-6 leading-relaxed max-w-xs">
                {language === 'es' 
                  ? 'Revolucionando el proceso de contratación global mediante inteligencia artificial autónoma y decisiones basadas en datos objetivos.' 
                  : 'Revolutionizing the global hiring process through autonomous artificial intelligence and objective data-driven decisions.'}
              </p>
            </div>
            
            <div>
              <h4 className="text-white font-medium mb-6">Product</h4>
              <ul className="space-y-4 text-sm text-neutral-400">
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Entrevistas de IA' : 'AI Interviews'}</a></li>
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Analíticas' : 'Analytics'}</a></li>
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Integraciones' : 'Integrations'}</a></li>
                <li><a href="/pricing" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Precios' : 'Pricing'}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-medium mb-6">Company</h4>
              <ul className="space-y-4 text-sm text-neutral-400">
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Sobre Nosotros' : 'About Us'}</a></li>
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Carreras' : 'Careers'}</a></li>
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Blog' : 'Blog'}</a></li>
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Contacto' : 'Contact'}</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-medium mb-6">Legal</h4>
              <ul className="space-y-4 text-sm text-neutral-400">
                <li><a href="/privacy" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Aviso de Privacidad' : 'Privacy Policy'}</a></li>
                <li><a href="/terms" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Términos de Servicio' : 'Terms of Service'}</a></li>
                <li><a href="#" className="hover:text-[#D3FB52] transition-colors">{language === 'es' ? 'Seguridad' : 'Security'}</a></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between text-xs text-neutral-500">
            <p>© {new Date().getFullYear()} WorldBrain EdTech. {language === 'es' ? 'Todos los derechos reservados.' : 'All rights reserved.'}</p>
            <div className="flex items-center gap-6 mt-4 md:mt-0">
              <a href="#" className="hover:text-white transition-colors">Twitter</a>
              <a href="#" className="hover:text-white transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>


      <style jsx global>{`
        .mask-image-fade {
          -webkit-mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent);
          mask-image: linear-gradient(to right, transparent, black 15%, black 85%, transparent);
        }
      `}</style>
    </div>
  );
}
