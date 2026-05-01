'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Reclutify Global Error]', error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#1a1b23] text-white font-sans flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-red-500/10 border border-red-500/20 mb-8">
            <span className="text-4xl">💥</span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight mb-4">
            Error crítico
          </h1>
          <p className="text-neutral-400 leading-relaxed mb-4">
            Ocurrió un error inesperado en la aplicación. Por favor recarga la página.
          </p>
          {error.digest && (
            <p className="text-xs text-neutral-600 font-mono mb-8">
              Error ID: {error.digest}
            </p>
          )}

          <button
            onClick={reset}
            className="inline-flex items-center gap-2 bg-[#D3FB52] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#c1e847] transition-colors"
          >
            Recargar página
          </button>
        </div>
      </body>
    </html>
  );
}
