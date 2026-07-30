'use client';

import { motion } from 'framer-motion';

import { useAppStore } from '@/store/appStore';
/**
 * Sección «TestimonialsSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
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
