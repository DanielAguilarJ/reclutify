'use client';

/**
 * Índice del programa: progreso global compacto + lista de módulos.
 *
 * ── Decisiones de diseño ──────────────────────────────────────────────────────
 *
 * · El progreso global era un anillo de 120 px con degradado y cuatro cifras
 *   compitiendo (porcentaje, fracción, tiempo, calificación). Aquí es una barra
 *   de 6 px con una cifra dominante y el resto como metadatos discretos.
 * · Cada módulo era un `div` con `onClick`: invisible para el teclado y para los
 *   lectores de pantalla. Ahora es un `<button>` dentro de un `<ol>`, con
 *   `aria-current="page"` en el activo y navegación con flechas dentro de la
 *   lista.
 * · Los módulos bloqueados no son enfocables (no hay nada que activar) pero sí
 *   anuncian su estado, para que el orden del plan se entienda igual.
 */

import { useRef, type KeyboardEvent } from 'react';
import { CheckCircle2, Circle, Lock, PlayCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { TrainingProgressStatus } from '@/types';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import { getTrainingCopy } from '@/lib/training/center-copy';
import {
  formatMinutes,
  isModuleOpenable,
  type LearningPlan,
  type LearningPlanItem,
} from '@/lib/training/learning-plan';
import { focusRing } from './ui';

interface ProgramOutlineProps {
  language: TrainingContentLanguage;
  plan: LearningPlan;
  /** Título del programa, como subtítulo del índice. */
  programTitle?: string;
  /** Módulo abierto ahora mismo, si la pantalla es la de un módulo. */
  activeModuleId?: string | null;
  /** Calificación global del empleado, si ya tiene alguna. */
  overallScore?: number;
  onSelectModule: (moduleId: string) => void;
}

const STATUS_ICON: Record<TrainingProgressStatus, LucideIcon> = {
  locked: Lock,
  available: PlayCircle,
  in_progress: Circle,
  completed: CheckCircle2,
};

export function ProgramOutline({
  language,
  plan,
  programTitle,
  activeModuleId,
  overallScore,
  onSelectModule,
}: ProgramOutlineProps) {
  const copy = getTrainingCopy(language).center.outline;
  const listRef = useRef<HTMLOListElement>(null);

  // Flechas, Inicio y Fin mueven el foco dentro del índice sin salir de él,
  // que es lo que se espera de una lista de navegación larga.
  const handleListKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];

    if (!keys.includes(event.key)) return;

    const items = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-outline-item]'
      ) ?? []
    );

    if (items.length === 0) return;

    const currentIndex = items.indexOf(
      document.activeElement as HTMLButtonElement
    );

    let nextIndex = currentIndex;

    if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, items.length - 1);
    } else if (event.key === 'ArrowUp') {
      nextIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else {
      nextIndex = items.length - 1;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">{copy.title}</h2>

        {programTitle ? (
          <p className="mt-0.5 truncate text-xs text-muted">{programTitle}</p>
        ) : null}

        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold text-foreground">
              {copy.progress(plan.percent)}
            </span>
            <span className="text-xs text-muted">
              {copy.moduleCount(plan.completedCount, plan.total)}
            </span>
          </div>

          <div
            role="progressbar"
            aria-valuenow={plan.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={copy.title}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${plan.percent}%` }}
            />
          </div>
        </div>

        {plan.totalTimeSpent > 0 || typeof overallScore === 'number' ? (
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
            {plan.totalTimeSpent > 0 ? (
              <div>
                <dt className="text-muted">{copy.timeSpent}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {formatMinutes(plan.totalTimeSpent)}
                </dd>
              </div>
            ) : null}

            {typeof overallScore === 'number' ? (
              <div>
                <dt className="text-muted">{copy.score}</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  {overallScore}%
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      <nav aria-label={copy.navLabel}>
        {plan.total === 0 ? (
          <p className="text-xs text-foreground/70">{copy.empty}</p>
        ) : (
          <ol ref={listRef} onKeyDown={handleListKeyDown} className="space-y-0.5">
            {plan.items.map((item) => (
              <OutlineRow
                key={item.module.id}
                item={item}
                language={language}
                isActive={item.module.id === activeModuleId}
                onSelect={onSelectModule}
              />
            ))}
          </ol>
        )}
      </nav>
    </div>
  );
}

interface OutlineRowProps {
  item: LearningPlanItem;
  language: TrainingContentLanguage;
  isActive: boolean;
  onSelect: (moduleId: string) => void;
}

function OutlineRow({ item, language, isActive, onSelect }: OutlineRowProps) {
  const copy = getTrainingCopy(language).center.outline;
  const StatusIcon = STATUS_ICON[item.status];
  const openable = isModuleOpenable(item.status);

  const statusLabel = {
    locked: copy.status.locked,
    available: copy.status.available,
    in_progress: copy.status.inProgress,
    completed: copy.status.completed,
  }[item.status];

  const meta =
    item.status === 'completed' && typeof item.progress?.score === 'number'
      ? `${statusLabel} · ${item.progress.score}%`
      : typeof item.module.durationEstimate === 'number'
        ? `${statusLabel} · ${formatMinutes(item.module.durationEstimate)}`
        : statusLabel;

  const body = (
    <>
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold ${
          item.status === 'completed'
            ? 'bg-accent-soft text-accent'
            : 'bg-surface text-muted'
        }`}
      >
        {item.status === 'completed' ? (
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          item.position
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {item.module.title}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-foreground/70">
          {item.status !== 'completed' ? (
            <StatusIcon className="h-3 w-3" aria-hidden="true" />
          ) : null}
          {meta}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {openable ? (
        <button
          type="button"
          data-outline-item
          aria-current={isActive ? 'page' : undefined}
          onClick={() => onSelect(item.module.id)}
          className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${focusRing} ${
            isActive
              ? 'bg-accent-soft text-foreground'
              : 'text-foreground hover:bg-surface-hover'
          }`}
        >
          {body}
        </button>
      ) : (
        <div className="flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-muted">
          {body}
        </div>
      )}
    </li>
  );
}
