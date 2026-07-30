'use client';

import { Check, Minus } from 'lucide-react';

import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
/**
 * Sección «ComparisonSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
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
