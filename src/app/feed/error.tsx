'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/feed`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function FeedError({
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
      context="feed"
      title="No pudimos cargar el feed"
      description="Ocurrió un error al traer las publicaciones. Puedes reintentar sin perder tu sesión."
      homeHref="/feed"
      homeLabel="Recargar el feed"
    />
  );
}
