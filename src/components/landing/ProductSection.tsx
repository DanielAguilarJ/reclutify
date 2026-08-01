'use client';


import { useAppStore } from '@/store/appStore';
/**
 * Sección «ProductSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
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
