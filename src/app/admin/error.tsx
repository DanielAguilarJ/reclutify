'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/admin`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function AdminError({
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
      context="admin"
      title="No pudimos cargar esta sección del panel"
      description="Ocurrió un error al preparar esta pantalla. Tus datos no se han perdido: la barra lateral sigue disponible para moverte a otra sección, o puedes reintentar aquí mismo."
      homeHref="/admin"
      homeLabel="Ir al panel"
    />
  );
}
