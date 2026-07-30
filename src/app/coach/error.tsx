'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/coach`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function CoachError({
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
      context="coach"
      title="No pudimos cargar esta sección"
      description="Ocurrió un error al preparar esta pantalla del panel del asesor. Puedes reintentar o volver al inicio del panel."
      homeHref="/coach"
      homeLabel="Ir al panel"
    />
  );
}
