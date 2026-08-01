'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/career-fair`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function CareerFairError({
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
      context="career-fair"
      title="No pudimos cargar las vacantes"
      description="Ocurrió un error al traer la bolsa de trabajo. Puedes reintentar o volver al listado completo."
      homeHref="/career-fair"
      homeLabel="Ver todas las vacantes"
    />
  );
}
