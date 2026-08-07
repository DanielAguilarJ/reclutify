'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { useAppStore } from '@/store/appStore';

/**
 * Conmutador de idioma.
 *
 * POR QUÉ EXISTE EL PROP `tone`
 * -----------------------------
 * Los colores por defecto usan los tokens del tema (`bg-border`, `text-muted`), que
 * resuelven vía `[data-theme]`. Eso es correcto en el panel de administración, en el de
 * asesor y en `AppNavbar`, que viven dentro del tema.
 *
 * La landing es el caso que rompe: fuerza fondo `#0a0a0a` pero NO declara
 * `[data-theme="dark"]`, así que `--app-muted` y `--app-border` resuelven a sus valores
 * del tema CLARO. Resultado medido sobre el header: la etiqueta inactiva sale
 * `#6b7280` sobre una pista de `#e2e8f0` al 40 %, es decir **1.07:1** — por debajo de
 * cualquier umbral de WCAG, y en la práctica invisible. Quien tuviera la interfaz en
 * español no podía leer que existía «EN».
 *
 * `tone="light"` fija colores explícitos para superficies oscuras, igual que hace
 * `Logo` con su propio `tone`. Es la misma decisión y por la misma razón.
 *
 * El arreglo de fondo sería declarar `@custom-variant dark` o poner
 * `data-theme="dark"` en las páginas de fondo oscuro forzado (`/`, `/pricing`,
 * `/career-fair`, `not-found`). Eso cambia cómo resuelven los tokens en todas ellas y
 * no cabe en un cambio del header: queda anotado, no resuelto.
 */
export default function LanguageToggle({
  tone = 'auto',
}: {
  /** `auto` usa los tokens del tema. `light` fija colores para fondo oscuro forzado. */
  tone?: 'auto' | 'light';
}) {
  const { language, setLanguage } = useAppStore();
  const reduceMotion = useReducedMotion();
  const es = language === 'es';

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'es' : 'en');
  };

  const claro = tone === 'light';

  const pista = claro
    ? 'bg-white/[0.08] border-white/[0.16]'
    : 'bg-border/40 border-border/50';

  const inactivo = claro ? 'text-white/70' : 'text-muted';

  return (
    <button
      onClick={toggleLanguage}
      className={`relative flex cursor-pointer items-center overflow-hidden rounded-full border p-1 ${pista}`}
      /* El `aria-label` anterior era «Toggle language»: en inglés siempre, y sin decir a
         qué idioma se cambia. Ahora está en el idioma activo y nombra el destino, que es
         la información que necesita quien no ve la píldora. */
      aria-label={es ? 'Cambiar el idioma a inglés' : 'Switch language to Spanish'}
    >
      <div className="relative z-10 flex w-16 text-[10px] font-bold uppercase tracking-wider">
        <span
          className={`flex-1 py-1 text-center transition-colors ${
            language === 'en' ? 'text-white' : inactivo
          }`}
        >
          EN
        </span>
        <span
          className={`flex-1 py-1 text-center transition-colors ${
            language === 'es' ? 'text-white' : inactivo
          }`}
        >
          ES
        </span>
      </div>

      {/* Píldora animada del estado activo. */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 top-1 w-8 rounded-full bg-primary shadow-sm"
        animate={{ left: language === 'en' ? '4px' : '32px' }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 300, damping: 25 }
        }
      />
    </button>
  );
}
