import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Configuración de ESLint.
 *
 * QUÉ ESTABA MAL
 * --------------
 * La versión anterior ignoraba VEINTIDÓS rutas del código fuente, con este
 * comentario:
 *
 *   // Ignorar directorios y archivos no relacionados con capacitación para que
 *   // lint pase con 0
 *
 * Entre lo ignorado estaba `src/components/**`, `src/app/actions/**`,
 * `src/app/admin/**`, `src/app/interview/**`, `src/middleware.ts` y
 * `src/app/LandingClient.tsx`. Es decir: `npm run lint` daba cero problemas
 * porque no miraba la mayoría del proyecto, incluida toda la interfaz, todas las
 * server actions y el middleware de autenticación.
 *
 * No era una elección de estilo: los ignores tapaban bugs reales. Al retirarlos
 * aparecieron 42 errores, entre ellos `Date.now()` durante el render (discrepancia
 * de hidratación), un `useRef` leído en el render para decidir qué pintar, una
 * variable usada antes de declararse y tres `<a>` hacia rutas internas que
 * provocaban recarga completa en vez de navegación de cliente. Todos corregidos en
 * el mismo commit que este archivo.
 *
 * QUÉ SE IGNORA AHORA
 * -------------------
 * Solo lo que no es código fuente: artefactos de compilación y tipos generados.
 * Ningún directorio de `src/`.
 *
 * LAS TRES REGLAS DEGRADADAS A AVISO
 * ----------------------------------
 * `react-hooks/set-state-in-effect`, `react-hooks/static-components` y
 * `react-hooks/preserve-manual-memoization` vienen del compilador de React y
 * marcan patrones que funcionan pero son subóptimos (re-renderizados en cascada,
 * componentes definidos dentro del render, memoización que el compilador no puede
 * preservar).
 *
 * Quedan como AVISO y no como error por dos razones:
 *
 *  1. Los 19 casos restantes están en componentes de 600 a 2 100 líneas
 *     (`SearchClient`, `admin/training/configure`, `admin/analytics/bias`).
 *     Corregirlos exige reestructurar esos componentes, que es trabajo de
 *     refactorización con riesgo de regresión real, no un arreglo de lint.
 *  2. Un aviso es visible y accionable. La alternativa que había —ignorar el
 *     directorio entero— hacía invisibles TAMBIÉN los errores de verdad.
 *
 * Están anotadas como deuda técnica en `REPORTE_REFACTOR.md` con la lista de
 * archivos. Cuando esos componentes se dividan, la regla se puede volver a subir a
 * error.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    // Artefactos de compilación.
    '.next/**',
    'out/**',
    'build/**',
    // Tipos que genera Next; no se editan a mano.
    'next-env.d.ts',
    // Configuración de sondeo puntual, no forma parte del proyecto.
    'eslint.probe.mjs',
  ]),

  {
    name: 'reclutify/react-compiler-warnings',
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },

  {
    // Las pruebas necesitan afirmar sobre formas arbitrarias y construir dobles,
    // así que un `any` puntual ahí es una herramienta, no una fuga de tipos. Sigue
    // avisando para que no se normalice.
    name: 'reclutify/tests',
    files: ['src/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);

export default eslintConfig;
