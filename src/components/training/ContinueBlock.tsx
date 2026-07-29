'use client';

/**
 * Bloque de continuación: la única acción primaria del Centro de Capacitación.
 *
 * ── Por qué es lo primero de la columna principal ─────────────────────────────
 *
 * Antes el empleado entraba a una lista de tarjetas del mismo peso y tenía que
 * buscar cuál era la suya. La pregunta que trae al entrar es siempre la misma
 * —"¿qué hago ahora?"— y esta es la respuesta: el módulo que le toca, con un
 * botón que lo abre. El resto de la pantalla es contexto.
 *
 * Es el único bloque con relleno de acento; el resto usa `card` sobre
 * `background`, para que la mirada tenga un sitio evidente al que ir.
 */

import { ArrowRight, Clock } from 'lucide-react';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import { getTrainingCopy } from '@/lib/training/center-copy';
import {
  formatMinutes,
  type TrainingNextAction,
} from '@/lib/training/learning-plan';
import { cardSurface, primaryButton } from './ui';

interface ContinueBlockProps {
  language: TrainingContentLanguage;
  action: TrainingNextAction;
  /** `true` mientras se abre el módulo (llamada a `startModule` en vuelo). */
  busy?: boolean;
  onOpenModule: (moduleId: string) => void;
}

export function ContinueBlock({
  language,
  action,
  busy = false,
  onOpenModule,
}: ContinueBlockProps) {
  const copy = getTrainingCopy(language).center.next;

  // El cierre del programa tiene su propio bloque; aquí no hay acción.
  if (action.kind === 'complete') {
    return null;
  }

  if (action.kind === 'empty' || action.kind === 'locked' || !action.item) {
    const isEmpty = action.kind === 'empty';

    return (
      <section className={`${cardSurface} p-5 sm:p-6`}>
        <h2 className="text-base font-semibold">
          {isEmpty ? copy.emptyTitle : copy.lockedTitle}
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          {isEmpty ? copy.emptyBody : copy.lockedBody}
        </p>
      </section>
    );
  }

  const { item } = action;
  const eyebrow =
    action.kind === 'start'
      ? copy.startEyebrow
      : action.kind === 'review'
        ? copy.reviewEyebrow
        : copy.resumeEyebrow;

  const actionLabel =
    action.kind === 'start'
      ? copy.startAction
      : action.kind === 'review'
        ? copy.reviewAction
        : copy.resumeAction;

  const sectionCount = item.module.content?.sections?.length ?? 0;

  return (
    <section className="rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-6">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>

      <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {item.module.title}
      </h2>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground/75">
        <span>
          {getTrainingCopy(language).center.outline.moduleNumber(item.position)}
        </span>
        {typeof item.module.durationEstimate === 'number' ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatMinutes(item.module.durationEstimate)}
          </span>
        ) : null}
        {sectionCount > 0 ? <span>{copy.sections(sectionCount)}</span> : null}
      </p>

      {item.module.description ? (
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-foreground/80">
          {item.module.description}
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => onOpenModule(item.module.id)}
        className={`mt-5 ${primaryButton}`}
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
