import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  TRAINING_RPC_ERRORS,
  findTrainingRpcErrorIdentifier,
  resolveTrainingRpcError,
  type TrainingRpcErrorIdentifier,
} from '../../lib/training/rpc-errors';

/**
 * El catálogo se recorre en lugar de replicarse caso por caso: cualquier
 * identificador que se añada a `TRAINING_RPC_ERRORS` queda cubierto por estas
 * pruebas sin tocar el archivo (Requisito 12.5).
 */
const CATALOG_ENTRIES = Object.entries(TRAINING_RPC_ERRORS) as [
  TrainingRpcErrorIdentifier,
  { status: number; es: string; en: string },
][];

describe('Training RPC error catalog', () => {
  it('exposes a non-empty catalog', () => {
    expect(CATALOG_ENTRIES.length).toBeGreaterThan(0);
  });

  // ─── Recorrido del mapa: identificador desnudo ───
  it.each(CATALOG_ENTRIES)(
    'resolves the bare identifier %s to its status and message',
    (identifier, entry) => {
      expect(findTrainingRpcErrorIdentifier(identifier)).toBe(identifier);
      expect(resolveTrainingRpcError(identifier)).toEqual({
        status: entry.status,
        message: entry.es,
      });
      expect(resolveTrainingRpcError(identifier, 'en')).toEqual({
        status: entry.status,
        message: entry.en,
      });
    },
  );

  // ─── Recorrido del mapa: formas reales que entrega PostgREST ───
  it.each(CATALOG_ENTRIES)(
    'recognizes %s wrapped, with appended detail, and inside a PostgREST error object',
    (identifier, entry) => {
      const shapes: unknown[] = [
        `exception: ${identifier}`,
        `${identifier} (sqlstate p0001)`,
        `Exception: ${identifier.toUpperCase()}`,
        { message: `exception: ${identifier}` },
        { message: 'database error', details: identifier },
        { message: null, hint: identifier },
        { error: { message: `exception: ${identifier}` } },
        new Error(`exception: ${identifier}`),
      ];

      for (const shape of shapes) {
        expect(findTrainingRpcErrorIdentifier(shape)).toBe(identifier);
        expect(resolveTrainingRpcError(shape, 'en')).toEqual({
          status: entry.status,
          message: entry.en,
        });
      }
    },
  );

  // ─── Statuses concretos por categoría ───
  it('assigns the documented status per category', () => {
    expect(resolveTrainingRpcError('forbidden')?.status).toBe(403);
    expect(resolveTrainingRpcError('module_locked')?.status).toBe(403);
    expect(resolveTrainingRpcError('training_program_not_found')?.status).toBe(
      404,
    );
    expect(resolveTrainingRpcError('training_document_in_use')?.status).toBe(
      409,
    );
    expect(resolveTrainingRpcError('invalid_score')?.status).toBe(400);
    expect(
      resolveTrainingRpcError('unauthorized_source_document')?.status,
    ).toBe(422);
    expect(resolveTrainingRpcError('modules_must_be_array')?.status).toBe(500);
  });
});

describe('Training RPC error message shapes', () => {
  it('strips the exception prefix, including stacked wrappers and quotes', () => {
    expect(findTrainingRpcErrorIdentifier('exception: forbidden')).toBe(
      'forbidden',
    );
    expect(findTrainingRpcErrorIdentifier('exception: error: forbidden')).toBe(
      'forbidden',
    );
    expect(findTrainingRpcErrorIdentifier('"exception: forbidden"')).toBe(
      'forbidden',
    );
    expect(findTrainingRpcErrorIdentifier('  exception:  forbidden.  ')).toBe(
      'forbidden',
    );
    expect(
      findTrainingRpcErrorIdentifier(
        'exception: training_document_in_use',
      ),
    ).toBe('training_document_in_use');
  });

  it('recognizes the identifier with an appended technical detail', () => {
    expect(findTrainingRpcErrorIdentifier('forbidden (sqlstate p0001)')).toBe(
      'forbidden',
    );
    expect(
      findTrainingRpcErrorIdentifier(
        'training_program_not_published (sqlstate p0001)',
      ),
    ).toBe('training_program_not_published');
  });

  it('reads the identifier from details or hint when message does not carry it', () => {
    expect(
      findTrainingRpcErrorIdentifier({
        message: 'unexpected database failure',
        details: 'training_progress_not_found',
      }),
    ).toBe('training_progress_not_found');

    expect(
      findTrainingRpcErrorIdentifier({
        message: 'unexpected database failure',
        hint: 'exception: module_locked',
      }),
    ).toBe('module_locked');
  });

  it('reads the identifier nested inside an error wrapper', () => {
    expect(
      findTrainingRpcErrorIdentifier({
        error: { message: 'exception: candidate_org_mismatch' },
      }),
    ).toBe('candidate_org_mismatch');
  });

  it('reads the identifier from a thrown Error and from its cause', () => {
    expect(findTrainingRpcErrorIdentifier(new Error('invalid_score'))).toBe(
      'invalid_score',
    );

    const wrapped = new Error('rpc call failed') as Error & {
      cause?: unknown;
    };
    wrapped.cause = new Error('exception: invalid_time_delta');

    expect(findTrainingRpcErrorIdentifier(wrapped)).toBe('invalid_time_delta');
  });
});

describe('Training RPC error disambiguation', () => {
  it('prefers module_not_available_for_evaluation over module_not_available', () => {
    expect(
      findTrainingRpcErrorIdentifier('module_not_available_for_evaluation'),
    ).toBe('module_not_available_for_evaluation');
    expect(
      findTrainingRpcErrorIdentifier(
        'exception: module_not_available_for_evaluation',
      ),
    ).toBe('module_not_available_for_evaluation');
    expect(
      resolveTrainingRpcError('module_not_available_for_evaluation', 'en')
        ?.message,
    ).toBe(TRAINING_RPC_ERRORS.module_not_available_for_evaluation.en);

    // El identificador corto sigue reconociéndose por sí solo.
    expect(findTrainingRpcErrorIdentifier('module_not_available')).toBe(
      'module_not_available',
    );
  });

  it('prefers training_module_not_found over module_not_found', () => {
    expect(findTrainingRpcErrorIdentifier('training_module_not_found')).toBe(
      'training_module_not_found',
    );
    expect(
      findTrainingRpcErrorIdentifier('exception: training_module_not_found'),
    ).toBe('training_module_not_found');
    expect(findTrainingRpcErrorIdentifier('module_not_found')).toBe(
      'module_not_found',
    );
  });

  it('prefers module_not_assigned_to_employee over module_not_assigned', () => {
    expect(
      findTrainingRpcErrorIdentifier('module_not_assigned_to_employee'),
    ).toBe('module_not_assigned_to_employee');
    expect(findTrainingRpcErrorIdentifier('module_not_assigned')).toBe(
      'module_not_assigned',
    );
  });

  it('does not match forbidden inside a natural language message', () => {
    expect(
      findTrainingRpcErrorIdentifier(
        'new row violates row-level security policy: action is forbidden',
      ),
    ).toBeNull();
    expect(
      resolveTrainingRpcError(
        'new row violates row-level security policy: action is forbidden',
      ),
    ).toBeNull();
    expect(
      findTrainingRpcErrorIdentifier({
        message: 'access to this resource is forbidden for the current role',
      }),
    ).toBeNull();
  });
});

describe('Training RPC unknown exceptions', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace only', '   '],
    ['object without message', { code: 'PGRST202', hint: null }],
    ['empty object', {}],
    ['unknown identifier', 'totally_unknown_exception'],
    ['wrapped unknown identifier', 'exception: totally_unknown_exception'],
    ['unknown identifier in details', { details: 'some_other_exception' }],
  ])('returns null for %s so the route falls back to its generic 500', (_label, error) => {
    expect(findTrainingRpcErrorIdentifier(error)).toBeNull();
    expect(resolveTrainingRpcError(error)).toBeNull();
    expect(resolveTrainingRpcError(error, 'en')).toBeNull();
  });
});

describe('Training RPC error language selection', () => {
  it('defaults to Spanish', () => {
    expect(resolveTrainingRpcError('forbidden')?.message).toBe(
      TRAINING_RPC_ERRORS.forbidden.es,
    );
    expect(resolveTrainingRpcError('forbidden', 'es')?.message).toBe(
      TRAINING_RPC_ERRORS.forbidden.es,
    );
  });

  it('returns distinct non-empty texts per language for every identifier', () => {
    for (const [identifier] of CATALOG_ENTRIES) {
      const spanish = resolveTrainingRpcError(identifier, 'es');
      const english = resolveTrainingRpcError(identifier, 'en');

      expect(spanish?.message.trim().length ?? 0).toBeGreaterThan(0);
      expect(english?.message.trim().length ?? 0).toBeGreaterThan(0);
      expect(spanish?.message).not.toBe(english?.message);
      expect(spanish?.status).toBe(english?.status);
    }
  });
});
