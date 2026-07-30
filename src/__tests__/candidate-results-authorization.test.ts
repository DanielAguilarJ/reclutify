// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  CANDIDATE_RESULT_PATCHABLE_COLUMNS,
  isCandidateResultOwnedBy,
  validateCandidateResultUpdates,
} from '@/lib/candidate-results/authorization';

/**
 * Pruebas de las dos comprobaciones puras que usa `/api/candidate-results`.
 *
 * La suite de la ruta verifica los códigos de estado y que no haya escrituras;
 * esta fija el contrato de la lista blanca columna por columna, incluidas todas
 * las de la tabla que el flujo del candidato NO debe poder tocar.
 */

/** Columnas reales de `candidate_results` (ver `src/lib/database.types.ts`). */
const ALL_COLUMNS = [
  'candidate_email',
  'candidate_linkedin',
  'candidate_name',
  'candidate_phone',
  'created_at',
  'date',
  'duration',
  'evaluation',
  'id',
  'org_id',
  'role_id',
  'role_title',
  'source',
  'status',
  'transcript',
  'video_url',
] as const;

const NON_PATCHABLE_COLUMNS = ALL_COLUMNS.filter(
  (column) => !(CANDIDATE_RESULT_PATCHABLE_COLUMNS as readonly string[]).includes(column),
);

describe('validateCandidateResultUpdates', () => {
  it('la lista blanca es exactamente lo que escribe el flujo del candidato', () => {
    expect([...CANDIDATE_RESULT_PATCHABLE_COLUMNS]).toEqual([
      'status',
      'evaluation',
      'transcript',
      'duration',
      'video_url',
    ]);
  });

  it('rechaza cualquier columna de la tabla que no esté en la lista blanca', () => {
    expect(NON_PATCHABLE_COLUMNS.length).toBeGreaterThan(0);

    for (const column of NON_PATCHABLE_COLUMNS) {
      const result = validateCandidateResultUpdates({ [column]: 'lo-que-sea' });
      expect(result.ok, `la columna ${column} no debería aceptarse`).toBe(false);
      if (!result.ok) {
        expect(result.rejectedKeys).toContain(column);
      }
    }
  });

  it('distingue las columnas de pertenencia del resto de claves desconocidas', () => {
    for (const column of ['id', 'org_id', 'role_id', 'source']) {
      const result = validateCandidateResultUpdates({ [column]: 'x' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('forbidden-columns');
    }

    const unknown = validateCandidateResultUpdates({ columna_inventada: 1 });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.reason).toBe('unknown-columns');
  });

  it('acepta cada columna de la lista blanca por separado', () => {
    const samples: Record<string, unknown> = {
      status: 'in-progress',
      evaluation: { overallScore: 50 },
      transcript: [{ role: 'user', content: 'hola', timestamp: 1 }],
      duration: 0,
      video_url: 'https://ejemplo-ficticio.test/v.webm',
    };

    for (const column of CANDIDATE_RESULT_PATCHABLE_COLUMNS) {
      const result = validateCandidateResultUpdates({ [column]: samples[column] });
      expect(result.ok, `la columna ${column} debería aceptarse`).toBe(true);
      if (result.ok) {
        expect(Object.keys(result.updates)).toEqual([column]);
      }
    }
  });

  it('acepta los nulos que la tabla permite', () => {
    const result = validateCandidateResultUpdates({
      duration: null,
      video_url: null,
      transcript: null,
      evaluation: null,
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza valores con el tipo equivocado en columnas permitidas', () => {
    for (const updates of [
      { duration: -1 },
      { duration: 'mucho' },
      { status: 'hired' },
      { transcript: 'texto plano' },
      { video_url: 42 },
    ]) {
      const result = validateCandidateResultUpdates(updates);
      expect(result.ok, `${JSON.stringify(updates)} no debería aceptarse`).toBe(false);
    }
  });

  it('rechaza updates que no son un objeto plano', () => {
    for (const raw of [[], 'texto', 7, null, true]) {
      const result = validateCandidateResultUpdates(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not-an-object');
    }
  });

  it('rechaza un objeto vacío', () => {
    const result = validateCandidateResultUpdates({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('empty');
  });
});

describe('isCandidateResultOwnedBy', () => {
  const expected = { roleId: 'role-1', orgId: 'org-1' };

  it('acepta la fila del mismo rol y la misma organización', () => {
    expect(
      isCandidateResultOwnedBy({ role_id: 'role-1', org_id: 'org-1' }, expected),
    ).toBe(true);
  });

  it('rechaza otra organización, otro rol, o ambos', () => {
    expect(
      isCandidateResultOwnedBy({ role_id: 'role-1', org_id: 'org-2' }, expected),
    ).toBe(false);
    expect(
      isCandidateResultOwnedBy({ role_id: 'role-2', org_id: 'org-1' }, expected),
    ).toBe(false);
    expect(
      isCandidateResultOwnedBy({ role_id: 'role-2', org_id: 'org-2' }, expected),
    ).toBe(false);
  });

  it('rechaza filas heredadas sin organización o sin rol', () => {
    expect(
      isCandidateResultOwnedBy({ role_id: 'role-1', org_id: null }, expected),
    ).toBe(false);
    expect(isCandidateResultOwnedBy({ role_id: null, org_id: 'org-1' }, expected)).toBe(
      false,
    );
  });
});
