'use client';

/**
 * Lectura del módulo como documento.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────
 *
 * La vista de módulo mostraba únicamente el chat con el tutor: las secciones
 * generadas para el programa solo aparecían como títulos en la lateral, así que
 * el material que alguien escribió no se podía leer. Aquí sí: un `<article>` con
 * ancho de línea de ~68 caracteres, un nivel de encabezado por sección y los
 * puntos clave como cita lateral.
 *
 * Los `id` de sección permiten que la lista de lectura de la lateral sea
 * navegación real con enlaces, no una lista decorativa.
 */

import type { TrainingModuleSection } from '@/types';
import type { TrainingContentLanguage } from '@/lib/training/content-language';
import { getTrainingCopy } from '@/lib/training/center-copy';
import { readingWidth } from './ui';

interface ModuleReaderProps {
  language: TrainingContentLanguage;
  description?: string;
  sections: TrainingModuleSection[];
}

/** `id` estable de una sección, compartido con la lista de lectura. */
export function moduleSectionId(index: number): string {
  return `training-section-${index}`;
}

/** El cuerpo llega como texto plano: los saltos de línea son los párrafos. */
function toParagraphs(body: string): string[] {
  return body
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

export function ModuleReader({
  language,
  description,
  sections,
}: ModuleReaderProps) {
  const copy = getTrainingCopy(language).module;

  return (
    <article className={readingWidth}>
      {description ? (
        <p className="text-base leading-relaxed text-foreground/75">{description}</p>
      ) : null}

      {sections.length === 0 ? (
        <p className="mt-6 text-sm text-foreground/75">{copy.emptyContent}</p>
      ) : null}

      {sections.map((section, index) => {
        const keyPoints = section.keyPoints ?? [];

        return (
          <section
            key={index}
            id={moduleSectionId(index)}
            className="mt-8 scroll-mt-24 first:mt-6"
          >
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {section.title}
            </h2>

            {toParagraphs(section.body ?? '').map((paragraph, paragraphIndex) => (
              <p
                key={paragraphIndex}
                className="mt-3 text-[15px] leading-7 text-foreground/85"
              >
                {paragraph}
              </p>
            ))}

            {keyPoints.length > 0 ? (
              <div className="mt-4 rounded-r-xl border-l-2 border-accent bg-surface px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {copy.keyPoints}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {keyPoints.map((point, pointIndex) => (
                    <li
                      key={pointIndex}
                      className="text-sm leading-relaxed text-foreground/80"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}
    </article>
  );
}
