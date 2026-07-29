import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

// ============================================================
// Mock de cookies() — el `set` tiene que ser espiable porque la
// cookie HttpOnly es el resultado observable del Requisito 8.1.
// ============================================================

const mockCookieSet = vi.fn();
const mockCookieGet = vi.fn(() => undefined);
const mockCookieDelete = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    set: mockCookieSet,
    get: mockCookieGet,
    delete: mockCookieDelete,
  }),
}));

// ============================================================
// Mock de Supabase (cliente encadenable con registro de llamadas)
// ============================================================

type Operation = 'select' | 'update' | 'insert';

interface CallRecord {
  table: string;
  op: Operation;
  columns?: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

interface FluentMock {
  select: (columns?: string) => FluentMock;
  insert: (payload: Record<string, unknown>) => FluentMock;
  update: (payload: Record<string, unknown>) => FluentMock;
  eq: (column: string, value: unknown) => FluentMock;
  is: (column: string, value: unknown) => FluentMock;
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
}

/** Llamadas en orden de ejecución: permite afirmar que se revoca antes de insertar. */
let calls: CallRecord[] = [];

/** Resultado del `select` sobre `training_employees`, resuelto por hash. */
let employeeRow: Record<string, unknown> | null = null;
let employeeQueryError: unknown = null;

/** Cola de resultados para los `insert` en `training_access_sessions`. */
let sessionInsertResults: Array<{ error: unknown }> = [];

/** Resultado de los `update` de revocación. */
let sessionUpdateResult: { error: unknown } = { error: null };

const resolveResult = (record: CallRecord): unknown => {
  if (record.table === 'training_employees' && record.op === 'select') {
    if (employeeQueryError) {
      return { data: null, error: employeeQueryError };
    }

    const hashFilter = record.filters.find(
      ([column]) => column === 'access_token_hash',
    )?.[1];

    // El empleado solo se encuentra si la ruta consultó por el hash correcto.
    // Un token desconocido (o el token en claro) devuelve `null`.
    return hashFilter === EXPECTED_INVITATION_HASH
      ? { data: employeeRow, error: null }
      : { data: null, error: null };
  }

  if (record.table === 'training_access_sessions' && record.op === 'insert') {
    return sessionInsertResults.shift() ?? { error: null };
  }

  if (record.table === 'training_access_sessions' && record.op === 'update') {
    return sessionUpdateResult;
  }

  return { data: null, error: null };
};

const createFluentMock = (table: string): FluentMock => {
  let record: CallRecord | null = null;

  const start = (op: Operation, extra: Partial<CallRecord>): FluentMock => {
    record = { table, op, filters: [], ...extra };
    calls.push(record);
    return fluent;
  };

  const settle = async (): Promise<unknown> => {
    if (!record) {
      throw new Error(`No operation started on table ${table}`);
    }

    return resolveResult(record);
  };

  const fluent: FluentMock = {
    select: (columns) => start('select', { columns }),
    insert: (payload) => start('insert', { payload }),
    update: (payload) => start('update', { payload }),
    eq: (column, value) => {
      record?.filters.push([column, value]);
      return fluent;
    },
    is: (column, value) => {
      record?.filters.push([column, value]);
      return fluent;
    },
    maybeSingle: settle,
    single: settle,
    then: (resolve, reject) => settle().then(resolve, reject),
  };

  return fluent;
};

const mockFrom = vi.fn((table: string) => createFluentMock(table));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
  }),
}));

import { POST } from '@/app/api/training/access/route';
import { TRAINING_COOKIE_NAME } from '@/lib/training/session';
import { hashOpaqueToken, createOpaqueToken } from '@/lib/training/tokens';

// ============================================================
// Datos de prueba
// ============================================================

const EMPLOYEE_ID = '00000000-0000-4000-8000-0000000000e1';

/**
 * El esquema exige entre 32 y 200 caracteres. `createOpaqueToken` produce 43,
 * así que se usa un token con la forma real del que emite la contratación.
 */
const INVITATION_TOKEN = createOpaqueToken();

/**
 * El hash se deriva con la función real: `hashOpaqueToken` es determinista y es
 * parte de lo que se verifica, así que no se simula.
 */
const EXPECTED_INVITATION_HASH = hashOpaqueToken(INVITATION_TOKEN);

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 60 * 1000).toISOString();

const activeEmployee = () => ({
  id: EMPLOYEE_ID,
  access_expires_at: FUTURE,
  access_revoked_at: null,
});

const request = (token: string) =>
  new NextRequest('http://localhost/api/training/access', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

const sessionCalls = (op: Operation) =>
  calls.filter(
    (call) => call.table === 'training_access_sessions' && call.op === op,
  );

const indexOf = (table: string, op: Operation, occurrence = 0) => {
  let seen = 0;

  for (let i = 0; i < calls.length; i += 1) {
    if (calls[i].table === table && calls[i].op === op) {
      if (seen === occurrence) {
        return i;
      }

      seen += 1;
    }
  }

  return -1;
};

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
  path?: string;
  maxAge?: number;
}

const cookieCall = () => {
  expect(mockCookieSet).toHaveBeenCalledTimes(1);
  const [name, value, options] = mockCookieSet.mock.calls[0] as [
    string,
    string,
    CookieOptions,
  ];

  return { name, value, options };
};

describe('Training Access Endpoint (/api/training/access)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    employeeRow = activeEmployee();
    employeeQueryError = null;
    sessionInsertResults = [];
    sessionUpdateResult = { error: null };
  });

  // Requisitos 8.1, 8.3
  it('creates a session, sets the HttpOnly cookie and revokes previous sessions', async () => {
    const res = await POST(request(INVITATION_TOKEN));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // El empleado se busca por el hash del token, nunca por el token en claro.
    const employeeQuery = calls.find(
      (call) => call.table === 'training_employees',
    );
    expect(employeeQuery?.filters).toEqual([
      ['access_token_hash', EXPECTED_INVITATION_HASH],
    ]);
    expect(JSON.stringify(calls)).not.toContain(INVITATION_TOKEN);

    // Requisito 8.3: las sesiones activas previas se revocan.
    const revocations = sessionCalls('update');
    expect(revocations).toHaveLength(1);
    expect(revocations[0].filters).toContainEqual(['employee_id', EMPLOYEE_ID]);
    expect(revocations[0].filters).toContainEqual(['revoked_at', null]);
    expect(
      typeof (revocations[0].payload as { revoked_at?: unknown }).revoked_at,
    ).toBe('string');

    // La revocación ocurre antes de insertar la sesión nueva.
    const revokeIndex = indexOf('training_access_sessions', 'update');
    const insertIndex = indexOf('training_access_sessions', 'insert');
    expect(revokeIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(revokeIndex);

    // Requisito 8.1: cookie HttpOnly con el token de sesión.
    const { name, value, options } = cookieCall();
    expect(name).toBe(TRAINING_COOKIE_NAME);
    expect(value.length).toBeGreaterThan(0);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/');
    expect(options.maxAge).toBeGreaterThan(0);

    // La cookie lleva un token de sesión nuevo, no el de invitación.
    expect(value).not.toBe(INVITATION_TOKEN);

    // De la sesión solo se persiste el hash del token que viaja en la cookie.
    const inserted = sessionCalls('insert')[0].payload as {
      employee_id: string;
      session_token_hash: string;
      expires_at: string;
    };
    expect(inserted.employee_id).toBe(EMPLOYEE_ID);
    expect(inserted.session_token_hash).toBe(hashOpaqueToken(value));
    expect(inserted.session_token_hash).not.toBe(value);
    expect(new Date(inserted.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  // Requisito 8.2
  it('returns 401 for an unknown link without creating a session', async () => {
    const res = await POST(request(createOpaqueToken()));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Invalid training link');
    expect(sessionCalls('insert')).toHaveLength(0);
    expect(sessionCalls('update')).toHaveLength(0);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  // Requisito 8.2
  it('returns 401 for a revoked link without creating a session', async () => {
    employeeRow = { ...activeEmployee(), access_revoked_at: PAST };

    const res = await POST(request(INVITATION_TOKEN));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('This training link has been revoked');
    expect(sessionCalls('insert')).toHaveLength(0);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  // Requisito 8.2
  it('returns 401 for an expired link without creating a session', async () => {
    employeeRow = { ...activeEmployee(), access_expires_at: PAST };

    const res = await POST(request(INVITATION_TOKEN));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('This training link has expired');
    expect(sessionCalls('insert')).toHaveLength(0);
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  // Requisito 8.2: los tres motivos deben ser distinguibles entre sí.
  it('uses a distinct message for each rejection reason', async () => {
    const messages: string[] = [];

    const collect = async (
      row: Record<string, unknown> | null,
      token: string,
    ) => {
      calls = [];
      employeeRow = row;
      const res = await POST(request(token));
      expect(res.status).toBe(401);
      messages.push((await res.json()).error);
    };

    await collect(activeEmployee(), createOpaqueToken());
    await collect({ ...activeEmployee(), access_revoked_at: PAST }, INVITATION_TOKEN);
    await collect({ ...activeEmployee(), access_expires_at: PAST }, INVITATION_TOKEN);

    expect(new Set(messages).size).toBe(3);
  });

  it('returns 400 when the token does not satisfy the schema', async () => {
    const res = await POST(request('too_short'));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid training token');
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockCookieSet).not.toHaveBeenCalled();
  });

  // Requisito 8.3: colisión en el índice único de sesión activa.
  it('resolves a unique-index collision by revoking and retrying the insert', async () => {
    sessionInsertResults = [{ error: { code: '23505' } }, { error: null }];

    const res = await POST(request(INVITATION_TOKEN));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    // Dos inserciones: la que colisiona y el reintento.
    expect(sessionCalls('insert')).toHaveLength(2);

    // Una revocación adicional entre ambas inserciones.
    const revocations = sessionCalls('update');
    expect(revocations).toHaveLength(2);

    const firstInsert = indexOf('training_access_sessions', 'insert', 0);
    const secondInsert = indexOf('training_access_sessions', 'insert', 1);
    const retryRevoke = indexOf('training_access_sessions', 'update', 1);

    expect(retryRevoke).toBeGreaterThan(firstInsert);
    expect(secondInsert).toBeGreaterThan(retryRevoke);

    // El reintento usa el mismo hash de sesión que la cookie emitida.
    const { value } = cookieCall();
    const retryPayload = sessionCalls('insert')[1].payload as {
      session_token_hash: string;
    };
    expect(retryPayload.session_token_hash).toBe(hashOpaqueToken(value));
  });

  it('returns 500 when the employee lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    employeeQueryError = { code: '42P01', message: 'relation does not exist' };

    const res = await POST(request(INVITATION_TOKEN));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Could not validate training access');
    // La causa técnica se queda en el log del servidor.
    expect(JSON.stringify(body)).not.toContain('relation does not exist');
    expect(mockCookieSet).not.toHaveBeenCalled();
  });
});
