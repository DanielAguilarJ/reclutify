'use client';

/**
 * Navegación anterior/siguiente entre módulos.
 *
 * Faltaba por completo: terminar un módulo obligaba a volver al centro para
 * abrir el siguiente. El módulo siguiente puede estar bloqueado, y en ese caso
 * el botón se deshabilita y dice por qué en vez de desaparecer sin explicación.
 */

import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import { getTrainingCopy } from '@/lib/training/center-copy';
import {
  isModuleOpenable,
  type LearningPlanItem,
} from '@/lib/training/learning-plan';
import { secondaryButton } from './ui';

interface ModulePagerProps {
  language: TrainingContentLanguage;
  previous: LearningPlanItem | null;
  next: LearningPlanItem | null;
  onNavigate: (moduleId: string) => void;
}

export function ModulePager({
  language,
  previous,
  next,
  onNavigate,
}: ModulePagerProps) {
  const copy = getTrainingCopy(language).module;

  if (!previous && !next) {
    return null;
  }

  const nextLocked = next ? !isModuleOpenable(next.status) : false;

  return (
    <nav
      aria-label={copy.pagerLabel}
      className="mt-10 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0">
        {previous && isModuleOpenable(previous.status) ? (
          <button
            type="button"
            onClick={() => onNavigate(previous.module.id)}
            className={`${secondaryButton} max-w-full`}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              {copy.previous}
              <span className="sr-only">: {previous.module.title}</span>
            </span>
          </button>
        ) : null}
      </div>

      <div className="min-w-0 sm:text-right">
        {next ? (
          <>
            <button
              type="button"
              disabled={nextLocked}
              onClick={() => onNavigate(next.module.id)}
              className={`${secondaryButton} max-w-full`}
            >
              <span className="min-w-0 truncate">
                {copy.next}
                <span className="sr-only">: {next.module.title}</span>
              </span>
              {nextLocked ? (
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              )}
            </button>

            {nextLocked ? (
              <p className="mt-2 text-xs text-foreground/70">{copy.nextLocked}</p>
            ) : null}
          </>
        ) : null}
      </div>
    </nav>
  );
}
