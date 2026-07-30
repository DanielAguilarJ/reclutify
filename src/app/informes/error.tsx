'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/informes`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function InformesError({
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
      context="informes"
      title="La sesión informativa se interrumpió"
      description="Ocurrió un error durante la sesión con el asesor virtual. Puedes reintentar o volver al listado de programas."
      homeHref="/informes"
      homeLabel="Ver programas"
    />
  );
}
