'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, AlertTriangle } from 'lucide-react';

/**
 * Cuerpo compartido de los `error.tsx` por sección.
 *
 * POR QUÉ HACEN FALTA ERROR BOUNDARIES POR SECCIÓN
 * ------------------------------------------------
 * El proyecto solo tenía `src/app/error.tsx` (raíz) y `global-error.tsx`. En el
 * App Router, un `error.tsx` captura los errores de su subárbol y **preserva el
 * layout de los niveles superiores**. Con uno solo en la raíz, cualquier fallo en
 * cualquier página reemplaza la aplicación ENTERA por la pantalla de error: el
 * usuario pierde la barra lateral, la navegación y el contexto de dónde estaba, y
 * el único camino de vuelta es el enlace al inicio.
 *
 * Con uno por sección, un fallo en `/admin/pipeline` mantiene la barra lateral de
 * `/admin` y el usuario puede irse a otra pantalla del panel sin recargar.
 *
 * QUÉ APORTA CADA MENSAJE
 * -----------------------
 * El texto lo pasa cada sección porque lo que el usuario puede hacer cambia según
 * dónde esté: en una entrevista lo que importa es que su progreso puede haberse
 * guardado y a quién avisar; en el panel, que puede volver al listado. Un mensaje
 * genérico («algo salió mal») no dice nada útil en ninguno de los dos casos.
 */
export interface SectionErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Prefijo del log, para poder aislar por sección. */
  context: string;
  title: string;
  description: string;
  /** Destino del enlace de salida. */
  homeHref: string;
  homeLabel: string;
}

export default function SectionError({
  error,
  reset,
  context,
  title,
  description,
  homeHref,
  homeLabel,
}: SectionErrorProps) {
  useEffect(() => {
    // El `digest` es lo único que correlaciona esta pantalla con la traza del
    // servidor, así que se registra junto al error.
    console.error(`[${context}]`, error);
  }, [context, error]);

  return (
    <div
      // `role="alert"` hace que un lector de pantalla anuncie la pantalla de error
      // al montarse. Sin él, el usuario solo percibe que el contenido desapareció.
      role="alert"
      className="flex min-h-[60vh] flex-1 flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
        <AlertTriangle className="h-7 w-7 text-red-500" aria-hidden="true" />
      </div>

      <h1 className="mb-3 max-w-lg text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mb-4 max-w-lg text-sm leading-relaxed text-muted">{description}</p>

      {error.digest && (
        <p className="mb-8 font-mono text-xs text-muted/60">
          {/* Se muestra para que el usuario pueda citarlo al reportar el problema. */}
          Error ID: {error.digest}
        </p>
      )}

      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Intentar de nuevo
        </button>
        <Link
          href={homeHref}
          className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 text-sm font-medium transition-colors hover:border-foreground/40"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
