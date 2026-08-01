'use client';

import SectionError from '@/components/shared/SectionError';

/**
 * Error boundary de `/interview`.
 *
 * Sin este archivo, cualquier fallo en esta sección subía hasta
 * `src/app/error.tsx` y reemplazaba la aplicación entera, perdiendo el layout y la
 * navegación. Ver `src/components/shared/SectionError.tsx`.
 */
export default function InterviewError({
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
      context="interview"
      title="La entrevista se interrumpió"
      description="Ocurrió un error durante la sesión. Si ya habías respondido preguntas, tus respuestas se guardan a medida que avanzas. Intenta reanudar; si el problema persiste, contacta al equipo de reclutamiento que te envió el enlace."
      homeHref="/"
      homeLabel="Salir"
    />
  );
}
