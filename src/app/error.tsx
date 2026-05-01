'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import { RefreshCw, Home } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Reclutify Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#1a1b23] text-white font-sans selection:bg-[#D3FB52] selection:text-black flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b border-white/5">
        <Link href="/"><Logo /></Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-red-500/10 border border-red-500/20 mb-8">
            <span className="text-4xl">⚠️</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Algo salió mal
          </h1>
          <p className="text-neutral-400 leading-relaxed mb-4">
            Ocurrió un error inesperado. Puedes intentar de nuevo o volver al inicio.
          </p>
          {error.digest && (
            <p className="text-xs text-neutral-600 font-mono mb-8">
              Error ID: {error.digest}
            </p>
          )}

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 bg-[#D3FB52] text-black font-semibold px-6 py-3 rounded-xl hover:bg-[#c1e847] transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Intentar de nuevo
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 border border-white/20 px-6 py-3 rounded-xl font-medium text-sm hover:border-white/40 transition-colors"
            >
              <Home className="w-4 h-4" />
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
