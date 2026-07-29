'use client';

/**
 * Cierre del programa.
 *
 * ── Qué se quitó y por qué ────────────────────────────────────────────────────
 *
 * Aquí vivían 20 puntos de confeti en posiciones `Math.random()` recalculadas en
 * cada render y animadas en bucle infinito, más un trofeo que se balanceaba para
 * siempre. Además de reposicionarse en cada render, el movimiento perpetuo no
 * aporta información y no se puede ignorar mientras se lee.
 *
 * El cierre ahora es un dato: quién completó qué, con qué calificación y en qué
 * fecha. Sin bucles y sin degradados.
 */

import { Award } from 'lucide-react';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import {
  formatTrainingDate,
  getTrainingCopy,
} from '@/lib/training/center-copy';
import { cardSurface } from './ui';

interface CompletionSummaryProps {
  language: TrainingContentLanguage;
  employeeName: string;
  programTitle?: string;
  overallScore?: number;
  completedAt?: string;
}

export function CompletionSummary({
  language,
  employeeName,
  programTitle,
  overallScore,
  completedAt,
}: CompletionSummaryProps) {
  const copy = getTrainingCopy(language).center.completion;

  return (
    <section className={`${cardSurface} p-5 sm:p-6`}>
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Award className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {copy.title}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
            {copy.body}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-surface p-4">
        <p className="text-xs font-medium text-foreground/70">
          {copy.certificateLabel}
        </p>
        <p className="mt-1 text-base font-semibold text-foreground">
          {employeeName}
        </p>
        {programTitle ? (
          <p className="text-sm text-foreground/70">{programTitle}</p>
        ) : null}

        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {typeof overallScore === 'number' ? (
            <div>
              <dt className="text-xs text-foreground/70">{copy.scoreLabel}</dt>
              <dd className="font-semibold text-foreground">{overallScore}%</dd>
            </div>
          ) : null}

          {completedAt ? (
            <div>
              <dt className="text-xs text-foreground/70">
                {getTrainingCopy(language).center.outline.status.completed}
              </dt>
              <dd className="font-medium text-foreground">
                {formatTrainingDate(completedAt, language)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <p className="mt-4 text-sm text-muted">{copy.reviewHint}</p>
    </section>
  );
}
