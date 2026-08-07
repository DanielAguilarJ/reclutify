'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

import { useAppStore } from '@/store/appStore';
/**
 * Sección «HowItWorksSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
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
      image: '/howitworks-step1-invitation.webp',
    },
    {
      num: '02',
      title: es ? 'Envía el enlace' : 'Send the link',
      desc: es
        ? 'Cada candidato entra desde su navegador, en su horario. Sin instalaciones, sin agendas, sin Zoom.'
        : 'Every candidate enters from their browser, on their schedule. No installs, no scheduling, no Zoom.',
      image: '/howitworks-step2-interview.webp',
    },
    {
      num: '03',
      title: es ? 'Lee el reporte' : 'Read the report',
      desc: es
        ? 'Recibe puntuaciones por tema, transcripción, video, banderas y una recomendación clara. Decide en minutos.'
        : 'Get per-topic scores, transcript, video, flags, and a clear recommendation. Decide in minutes.',
      image: '/howitworks-step3-report.webp',
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
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl mb-10">
            <Image
              src={step.image}
              alt=""
              fill
              sizes="(min-width: 768px) 33vw, 100vw"
              className="object-cover"
            />
          </div>
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
