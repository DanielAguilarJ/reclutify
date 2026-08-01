'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/training`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function TrainingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SectionError
      error={error}
      reset={reset}
      context="training"
      title="La sesión de capacitación se interrumpió"
      description="Ocurrió un error al cargar el contenido. Tu progreso se guarda al completar cada módulo, así que no perderás los módulos ya terminados."
      homeHref="/training/center"
      homeLabel="Ir al centro"
    />
  );
}
