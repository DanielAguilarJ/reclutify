'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MapPin, Briefcase, Clock, DollarSign } from 'lucide-react';

import { useAdminStore } from '@/store/adminStore';
import { useAppStore } from '@/store/appStore';
import { dictionaries } from '@/lib/i18n';
/**
 * Sección «OpenRolesSection» de la landing.
 *
 * Extraída de `src/app/LandingClient.tsx`, que reunía las veinte secciones en un
 * solo archivo de 1068 líneas. El código de cada componente es el mismo: lo único
 * que cambia es que ahora cada sección se puede leer, revisar y cargar por
 * separado.
 */
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
