'use client';

import { motion } from 'framer-motion';

import { useAppStore } from '@/store/appStore';
/**
 * Sección «StatsSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
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
