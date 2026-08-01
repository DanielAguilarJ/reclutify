import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/__tests__/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.d.ts',
        // Tipos generados desde el esquema de Supabase: no hay lógica que cubrir.
        'src/lib/database.types.ts',
      ],

      /**
       * Umbrales por ruta, NO un umbral global.
       *
       * POR QUÉ ASÍ
       * -----------
       * Un umbral global sobre este proyecto tendría que fijarse en el 30 % para pasar, y un
       * umbral del 30 % no protege nada: cabe dentro cualquier módulo nuevo sin una sola
       * prueba. Los umbrales por ruta hacen lo contrario: cada uno se fija justo por debajo de
       * lo que ese módulo tiene HOY, así que una regresión en un módulo cubierto rompe la
       * compilación aunque el número global suba.
       *
       * Los módulos que aparecen aquí son los que deciden autorización, validación, gasto de
       * API o manipulación de secretos. Los que no aparecen no están exentos: están anotados
       * como deuda en `REPORTE_REFACTOR.md`, con el motivo de la priorización.
       *
       * CÓMO SE ACTUALIZAN
       * ------------------
       * Al subir la cobertura de un módulo, se sube su umbral. Bajarlo requiere justificarlo
       * en la revisión, que es el punto: un umbral que se puede bajar sin explicación es un
       * umbral decorativo.
       */
      thresholds: {
        // Redacción de credenciales de terceros. Cubierto al 100 %.
        'src/lib/coach/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        // Máquina de estados de la entrevista, prompt y telemetría.
        'src/lib/interview/**': { statements: 65, branches: 50, functions: 60, lines: 65 },
        // Esquemas de validación de entrada.
        'src/lib/schemas/**': { statements: 90, branches: 60, functions: 60, lines: 90 },
        // Infraestructura de API: errores, tope de tasa, anti-SSRF, autenticación.
        'src/lib/api/**': { statements: 50, branches: 45, functions: 65, lines: 50 },
        // Reglas de la evaluación del candidato.
        'src/lib/services/**': { statements: 35, branches: 35, functions: 35, lines: 35 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
