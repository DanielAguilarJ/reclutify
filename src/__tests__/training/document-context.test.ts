import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  allocateCharBudget,
  buildDocumentContext,
  buildTrainingContextNotice,
  buildTruncationMarker,
  cutAtNaturalBoundary,
  limitProgramDocuments,
  resolveContextCharBudget,
  DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET,
  MAX_PROGRAM_DOCUMENTS,
  MIN_DOCUMENT_CHAR_FLOOR,
  TRUNCATION_MARKER_TAG,
  type DocumentContextSource,
} from '../../lib/training/document-context';

/**
 * Pruebas del reparto de contexto documental.
 *
 * Es lógica pura (sin IO, sin red, sin Supabase), así que se prueba directamente
 * y sin dobles: lo único que se simula es el marcador `server-only`, que en
 * Vitest no tiene sentido.
 *
 * El caso que motiva el módulo es el primero: con el reparto anterior
 * (`60.000 / nº documentos` y `slice` desnudo) dos documentos de 40.000
 * caracteres se recortaban aunque hubiera presupuesto de sobra, y el corte no
 * dejaba ninguna marca, así que el modelo rellenaba el hueco.
 */

/** Texto con párrafos y frases reales, para ejercitar el corte natural. */
const buildProse = (paragraphs: number): string => {
  const blocks: string[] = [];
  for (let index = 0; index < paragraphs; index += 1) {
    blocks.push(
      `Párrafo ${index + 1}. Esta es la primera frase del párrafo y describe una política interna. ` +
        `Esta es la segunda frase, algo más larga, que amplía el procedimiento aplicable al caso. ` +
        `Y esta es la tercera frase del bloque número ${index + 1}.`,
    );
  }
  return blocks.join('\n\n');
};

const source = (
  id: string,
  fileName: string,
  text: string | null | undefined,
): DocumentContextSource => ({ id, fileName, text });

/** Suma de un reparto, que nunca puede pasarse del presupuesto. */
const sum = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0);

describe('allocateCharBudget', () => {
  it('does not truncate anybody when everything fits', () => {
    // El caso normal, y el que el código anterior no cumplía.
    const lengths = [40_000, 40_000];

    const allocation = allocateCharBudget(lengths, 300_000);

    expect(allocation).toEqual(lengths);
  });

  it('never exceeds the budget when the material does not fit', () => {
    const lengths = [90_000, 30_000, 5_000];

    const allocation = allocateCharBudget(lengths, 50_000);

    expect(sum(allocation)).toBeLessThanOrEqual(50_000);
    // Y no deja presupuesto sin usar: hay material de sobra para gastarlo todo.
    expect(sum(allocation)).toBe(50_000);
  });

  it('splits proportionally to the real length, not in equal parts', () => {
    const lengths = [90_000, 10_000];

    const allocation = allocateCharBudget(lengths, 50_000, 0);

    // Reparto equitativo habría dado 25.000 a cada uno.
    expect(allocation[0]).toBeGreaterThan(allocation[1]);
    expect(allocation[0] / allocation[1]).toBeGreaterThan(2);
  });

  it('gives the tiny document everything it needs and the leftover to the huge one', () => {
    const lengths = [1_000, 100_000];

    const allocation = allocateCharBudget(lengths, 50_000);

    expect(allocation[0]).toBe(1_000);
    expect(allocation[1]).toBe(49_000);
    // Explícitamente NO 50/50, que es lo que hacía el código anterior.
    expect(allocation[1]).not.toBe(25_000);
  });

  it('redistributes the leftover across several passes until nothing is left over', () => {
    // Dos documentos diminutos y dos enormes: al saciar los pequeños, su
    // sobrante tiene que acabar en los grandes, no perderse.
    const lengths = [500, 800, 60_000, 60_000];

    const allocation = allocateCharBudget(lengths, 40_000);

    expect(allocation[0]).toBe(500);
    expect(allocation[1]).toBe(800);
    expect(sum(allocation)).toBe(40_000);
    // El resto se reparte entre los grandes, que son iguales de longitud.
    expect(allocation[2]).toBe(allocation[3]);
    expect(allocation[2] + allocation[3]).toBe(40_000 - 1_300);
  });

  it('honours the minimum floor per document with many documents', () => {
    // 10 documentos: uno pequeñísimo y nueve enormes. El suelo nominal (4.000)
    // cabe, así que nadie baja de ahí salvo quien no lo necesita.
    const lengths = [200, ...new Array<number>(9).fill(200_000)];

    const allocation = allocateCharBudget(lengths, 100_000);

    expect(allocation[0]).toBe(200);
    for (let index = 1; index < lengths.length; index += 1) {
      expect(allocation[index]).toBeGreaterThanOrEqual(MIN_DOCUMENT_CHAR_FLOOR);
    }
    expect(sum(allocation)).toBeLessThanOrEqual(100_000);
  });

  it('lowers the floor instead of overflowing when the nominal floor does not fit', () => {
    // 20 documentos grandes con un presupuesto en el que 20 × 4.000 no cabe:
    // un suelo que no cabe no es un suelo.
    const lengths = new Array<number>(20).fill(50_000);

    const allocation = allocateCharBudget(lengths, 50_000);

    expect(sum(allocation)).toBeLessThanOrEqual(50_000);
    for (const allowed of allocation) {
      expect(allowed).toBe(2_500);
    }
  });

  it('does not spend budget on empty documents', () => {
    const allocation = allocateCharBudget([0, 0, 10_000], 6_000);

    expect(allocation[0]).toBe(0);
    expect(allocation[1]).toBe(0);
    expect(allocation[2]).toBe(6_000);
  });

  it('handles degenerate inputs without throwing', () => {
    expect(allocateCharBudget([], 10_000)).toEqual([]);
    expect(allocateCharBudget([100, 200], 0)).toEqual([0, 0]);
    expect(allocateCharBudget([100, 200], -5)).toEqual([0, 0]);
    expect(allocateCharBudget([Number.NaN, 200], 1_000)).toEqual([0, 200]);
  });

  it('keeps its invariants across many generated shapes', () => {
    // Generador determinista (LCG) en lugar de una dependencia de property
    // testing: mismo efecto, cero dependencias nuevas.
    let seed = 987_654_321;
    const next = (max: number): number => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed % max;
    };

    for (let round = 0; round < 300; round += 1) {
      const count = 1 + next(12);
      const lengths = new Array<number>(count)
        .fill(0)
        .map(() => next(120_000));
      const budget = 1 + next(200_000);

      const allocation = allocateCharBudget(lengths, budget);

      // 1. Nunca se excede el presupuesto.
      expect(sum(allocation)).toBeLessThanOrEqual(budget);
      // 2. Nadie recibe más de lo que tiene.
      allocation.forEach((allowed, index) => {
        expect(allowed).toBeGreaterThanOrEqual(0);
        expect(allowed).toBeLessThanOrEqual(lengths[index]);
      });
      // 3. Si todo cabe, nadie se trunca.
      if (sum(lengths) <= budget) {
        expect(allocation).toEqual(lengths);
      } else {
        // 4. Si no cabe, el presupuesto se agota (hay material para ello).
        expect(sum(allocation)).toBe(budget);
      }
    }
  });
});

describe('cutAtNaturalBoundary', () => {
  it('returns the text untouched when it fits', () => {
    expect(cutAtNaturalBoundary('texto corto', 100)).toBe('texto corto');
  });

  it('never cuts in the middle of a word', () => {
    const text = buildProse(40);

    const cut = cutAtNaturalBoundary(text, 2_000);

    expect(cut.length).toBeLessThanOrEqual(2_000);
    // El carácter siguiente al corte en el original es un separador, o el corte
    // cayó justo al final de una frase/párrafo.
    const boundaryChar = text[cut.length];
    expect(boundaryChar === undefined || /[\s.]/.test(boundaryChar)).toBe(true);
    expect(cut.endsWith(' ')).toBe(false);
  });

  it('prefers a paragraph boundary when one is close to the limit', () => {
    const text = `${'a'.repeat(980)}\n\nsegundo párrafo que ya no cabe entero`;

    const cut = cutAtNaturalBoundary(text, 1_000);

    expect(cut).toBe('a'.repeat(980));
  });

  it('falls back to a sentence boundary when there is no paragraph break', () => {
    const text = `${'a'.repeat(490)}. ${'b'.repeat(600)}`;

    const cut = cutAtNaturalBoundary(text, 500);

    expect(cut).toBe(`${'a'.repeat(490)}.`);
  });

  it('cuts hard only when there is no separator at all', () => {
    const text = 'x'.repeat(5_000);

    const cut = cutAtNaturalBoundary(text, 1_000);

    expect(cut).toBe('x'.repeat(1_000));
  });

  it('returns an empty string for a non-positive limit', () => {
    expect(cutAtNaturalBoundary('texto', 0)).toBe('');
    expect(cutAtNaturalBoundary('texto', -10)).toBe('');
  });
});

describe('buildDocumentContext', () => {
  it('includes every document whole and adds no marker when everything fits', () => {
    const first = buildProse(3);
    const second = buildProse(5);

    const result = buildDocumentContext(
      [source('id-1', 'manual.pdf', first), source('id-2', 'politica.docx', second)],
      { budgetChars: 300_000 },
    );

    expect(result.context).toContain(first);
    expect(result.context).toContain(second);
    expect(result.context).not.toContain(TRUNCATION_MARKER_TAG);
    expect(result.truncatedDocuments).toEqual([]);
    expect(result.omittedChars).toBe(0);
    expect(result.includedChars).toBe(first.length + second.length);
    expect(result.documents.every((doc) => doc.truncated === false)).toBe(true);
  });

  it('keeps document headers with file name and id', () => {
    const result = buildDocumentContext([source('id-1', 'manual.pdf', 'contenido')], {
      budgetChars: 1_000,
    });

    expect(result.context).toContain('--- DOCUMENT: manual.pdf (ID: id-1) ---');
  });

  it('marks the truncated document and only that one', () => {
    const small = buildProse(2);
    const huge = buildProse(400);
    const budget = small.length + 6_000;

    const result = buildDocumentContext(
      [source('id-1', 'hoja.pdf', small), source('id-2', 'manual.pdf', huge)],
      { budgetChars: budget, floorChars: 1_000 },
    );

    expect(result.truncatedDocuments).toHaveLength(1);
    expect(result.truncatedDocuments[0].fileName).toBe('manual.pdf');
    // El documento pequeño entra completo, no a medias.
    expect(result.documents[0].truncated).toBe(false);
    expect(result.documents[0].includedChars).toBe(small.length);
    // Un solo marcador en todo el contexto.
    expect(result.context.split(TRUNCATION_MARKER_TAG)).toHaveLength(2);
  });

  it('spells out in the marker that the model must not invent the missing part', () => {
    const huge = buildProse(300);

    const result = buildDocumentContext([source('id-1', 'manual.pdf', huge)], {
      budgetChars: 5_000,
    });

    const omitted = result.documents[0].omittedChars;
    expect(result.context).toContain(buildTruncationMarker(omitted));
    expect(result.context).toContain('this document continues beyond this point');
    expect(result.context).toContain(`${omitted} characters were omitted`);
    expect(result.context).toContain('Do not infer, guess, reconstruct or invent');
  });

  it('never lets the included text exceed the budget', () => {
    const documents = new Array<number>(6)
      .fill(0)
      .map((_, index) => source(`id-${index}`, `doc-${index}.pdf`, buildProse(120)));

    const result = buildDocumentContext(documents, {
      budgetChars: 30_000,
      floorChars: 2_000,
    });

    expect(result.includedChars).toBeLessThanOrEqual(30_000);
    expect(result.truncatedDocuments).toHaveLength(6);
  });

  it('reports metadata that adds up per document and in total', () => {
    const first = buildProse(2);
    const second = buildProse(200);

    const result = buildDocumentContext(
      [source('id-1', 'hoja.pdf', first), source('id-2', 'manual.pdf', second)],
      { budgetChars: first.length + 4_000, floorChars: 1_000 },
    );

    for (const doc of result.documents) {
      expect(doc.includedChars + doc.omittedChars).toBe(doc.totalChars);
      expect(doc.truncated).toBe(doc.omittedChars > 0);
    }

    expect(result.totalChars).toBe(first.length + second.length);
    expect(result.includedChars + result.omittedChars).toBe(result.totalChars);
    expect(result.budgetChars).toBe(first.length + 4_000);
  });

  it('survives empty, null and undefined extracted text', () => {
    const result = buildDocumentContext(
      [
        source('id-1', 'vacio.pdf', ''),
        source('id-2', 'nulo.pdf', null),
        source('id-3', 'ausente.pdf', undefined),
        source('id-4', 'bueno.pdf', 'contenido real'),
      ],
      { budgetChars: 10_000 },
    );

    expect(result.totalChars).toBe('contenido real'.length);
    expect(result.omittedChars).toBe(0);
    expect(result.truncatedDocuments).toEqual([]);
    expect(result.context).not.toContain(TRUNCATION_MARKER_TAG);
    // Los documentos vacíos siguen presentes con su cabecera y a cero.
    expect(result.documents[0]).toMatchObject({
      fileName: 'vacio.pdf',
      totalChars: 0,
      includedChars: 0,
      omittedChars: 0,
      truncated: false,
    });
    expect(result.context).toContain('--- DOCUMENT: nulo.pdf (ID: id-2) ---');
  });

  it('returns an empty context for an empty document list', () => {
    const result = buildDocumentContext([], { budgetChars: 10_000 });

    expect(result.context).toBe('');
    expect(result.documents).toEqual([]);
    expect(result.totalChars).toBe(0);
  });

  it('uses the default budget when none is given', () => {
    const result = buildDocumentContext([source('id-1', 'doc.pdf', 'texto')]);

    expect(result.budgetChars).toBe(DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET);
  });
});

describe('resolveContextCharBudget', () => {
  it('accepts a positive integer', () => {
    expect(resolveContextCharBudget('750000')).toBe(750_000);
    expect(resolveContextCharBudget('  120000  ')).toBe(120_000);
  });

  it('falls back to the default for every invalid value', () => {
    for (const invalid of [
      undefined,
      '',
      '   ',
      '0',
      '-1',
      '-300000',
      '12.5',
      '1e6',
      'Infinity',
      'NaN',
      'abc',
      '300000abc',
      '0x1000',
      '9007199254740993',
    ]) {
      expect(resolveContextCharBudget(invalid)).toBe(
        DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET,
      );
    }
  });

  it('defaults to a budget far above the previous 60k limit', () => {
    expect(DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET).toBeGreaterThan(60_000 * 4);
  });

  it('reads the environment variable when no argument is given', () => {
    const previous = process.env.TRAINING_CONTEXT_CHAR_BUDGET;
    try {
      process.env.TRAINING_CONTEXT_CHAR_BUDGET = '123456';
      expect(resolveContextCharBudget()).toBe(123_456);

      process.env.TRAINING_CONTEXT_CHAR_BUDGET = 'not-a-number';
      expect(resolveContextCharBudget()).toBe(
        DEFAULT_TRAINING_CONTEXT_CHAR_BUDGET,
      );
    } finally {
      if (previous === undefined) {
        delete process.env.TRAINING_CONTEXT_CHAR_BUDGET;
      } else {
        process.env.TRAINING_CONTEXT_CHAR_BUDGET = previous;
      }
    }
  });
});

describe('limitProgramDocuments', () => {
  it('keeps everything and reports nothing omitted under the limit', () => {
    const documents = new Array<number>(5).fill(0).map((_, index) => ({ index }));

    const result = limitProgramDocuments(documents);

    expect(result.documents).toHaveLength(5);
    expect(result.omittedCount).toBe(0);
  });

  it('reports how many documents the limit left out', () => {
    const documents = new Array<number>(MAX_PROGRAM_DOCUMENTS + 3)
      .fill(0)
      .map((_, index) => ({ index }));

    const result = limitProgramDocuments(documents);

    expect(result.documents).toHaveLength(MAX_PROGRAM_DOCUMENTS);
    expect(result.omittedCount).toBe(3);
    expect(result.documents[0]).toEqual({ index: 0 });
  });
});

describe('buildTrainingContextNotice', () => {
  const fittingResult = buildDocumentContext(
    [source('id-1', 'doc.pdf', 'contenido')],
    { budgetChars: 10_000 },
  );

  it('returns null when everything fitted and no document was dropped', () => {
    expect(buildTrainingContextNotice(fittingResult, 0)).toBeNull();
  });

  it('reports documents dropped by the document limit even without truncation', () => {
    const notice = buildTrainingContextNotice(fittingResult, 4);

    expect(notice).not.toBeNull();
    expect(notice?.documentsOmittedByLimit).toBe(4);
    expect(notice?.documentLimit).toBe(MAX_PROGRAM_DOCUMENTS);
    expect(notice?.truncatedDocuments).toEqual([]);
  });

  it('names the truncated documents by file name with their omitted chars', () => {
    const result = buildDocumentContext(
      [
        source('id-1', 'hoja.pdf', 'corto'),
        source('id-2', 'manual.pdf', buildProse(200)),
      ],
      { budgetChars: 4_000, floorChars: 500 },
    );

    const notice = buildTrainingContextNotice(result, 0);

    expect(notice?.truncatedDocuments).toHaveLength(1);
    expect(notice?.truncatedDocuments[0].fileName).toBe('manual.pdf');
    expect(notice?.truncatedDocuments[0].omittedChars).toBe(
      result.documents[1].omittedChars,
    );
    expect(notice?.omittedChars).toBe(result.omittedChars);
    expect(notice?.budgetChars).toBe(4_000);
  });
});
