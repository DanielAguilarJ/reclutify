// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar la ruta.
vi.mock('server-only', () => ({}));

/**
 * Pruebas de autorización de `/api/candidate-results`.
 *
 * La ruta escribe con la SERVICE ROLE KEY, que bypassa RLS: si la ruta no
 * valida, no valida nadie. Estas pruebas fijan las dos comprobaciones del
 * tramo actual:
 *
 *  - `PATCH` solo acepta las columnas que el flujo del candidato actualiza de
 *    verdad, y rechaza la petición completa (400, cero escrituras) si aparece
 *    cualquier otra clave — en particular `org_id`, `role_id` o `id`, que son
 *    las que permitían mover una fila ajena a otra organización.
 *  - `POST` comprueba la pertenencia antes del `upsert`: pisar el `id` de otra
 *    organización responde 403 y deja la fila original intacta.
 *
 * La prueba de acceso (token de ticket o `public_token` de la vacante) es el
 * tramo siguiente y NO se cubre aquí a propósito.
 *
 * TODAS LAS CLAVES SON FICTICIAS. Ninguna credencial real puede entrar en este
 * archivo: quedaría en el historial de git para siempre.
 */

const FAKE_SUPABASE_URL = 'https://ejemplo-ficticio.supabase.co';
const FAKE_SERVICE_KEY = 'sb_secret_EJEMPLO-FICTICIO-NO-ES-UNA-CLAVE-REAL';

type Row = Record<string, unknown>;
type Filter = readonly [string, unknown];

interface FakeDb {
  roles: Row[];
  candidate_results: Row[];
}

interface WriteLogEntry {
  table: string;
  op: 'upsert' | 'update';
  payload: Row;
}

const db: FakeDb = { roles: [], candidate_results: [] };
const writeLog: WriteLogEntry[] = [];

function tableRows(table: string): Row[] {
  if (table === 'roles') return db.roles;
  if (table === 'candidate_results') return db.candidate_results;
  throw new Error(`Tabla no simulada en esta suite: ${table}`);
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every(([column, value]) => row[column] === value);
}

interface QueryResult {
  data: Row[] | Row | null;
  error: { message: string } | null;
}

/**
 * Constructor fluido mínimo que imita a `supabase-js` para las operaciones que
 * la ruta usa: `select().eq().maybeSingle()`, `update().eq()` y `upsert()`.
 * Las escrituras se aplican de verdad sobre `db` para poder afirmar tanto
 * "no hubo escritura" como "la fila quedó intacta".
 */
function createQueryBuilder(table: string) {
  const filters: Filter[] = [];
  let operation: 'select' | 'update' | 'upsert' = 'select';
  let payload: Row = {};

  const exec = (): QueryResult => {
    const rows = tableRows(table);

    if (operation === 'select') {
      return { data: rows.filter((row) => matches(row, filters)), error: null };
    }

    if (operation === 'update') {
      writeLog.push({ table, op: 'update', payload });
      const targets = rows.filter((row) => matches(row, filters));
      for (const target of targets) {
        Object.assign(target, payload);
      }
      return { data: targets, error: null };
    }

    writeLog.push({ table, op: 'upsert', payload });
    const index = rows.findIndex((row) => row.id === payload.id);
    if (index >= 0) {
      rows[index] = { ...rows[index], ...payload };
    } else {
      rows.push({ ...payload });
    }
    return { data: [payload], error: null };
  };

  const builder = {
    select: () => builder,
    update: (next: Row) => {
      operation = 'update';
      payload = next;
      return builder;
    },
    upsert: (next: Row) => {
      operation = 'upsert';
      payload = next;
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return builder;
    },
    maybeSingle: async (): Promise<QueryResult> => {
      const result = exec();
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? null, error: result.error };
    },
    single: async (): Promise<QueryResult> => {
      const result = exec();
      const rows = Array.isArray(result.data) ? result.data : [];
      return { data: rows[0] ?? null, error: result.error };
    },
    then: <T>(resolve: (value: QueryResult) => T): Promise<T> =>
      Promise.resolve(exec()).then(resolve),
  };

  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => createQueryBuilder(table),
  }),
}));

import { NextRequest } from 'next/server';
import { POST, PATCH } from '@/app/api/candidate-results/route';

const ORG_VICTIM = 'org-victima';
const ORG_ATTACKER = 'org-atacante';
const ROLE_VICTIM = 'role-victima';
const ROLE_ATTACKER = 'role-atacante';
const RESULT_VICTIM = 'cand-victima';

function seed() {
  db.roles = [
    { id: ROLE_VICTIM, org_id: ORG_VICTIM },
    { id: ROLE_ATTACKER, org_id: ORG_ATTACKER },
  ];
  db.candidate_results = [
    {
      id: RESULT_VICTIM,
      org_id: ORG_VICTIM,
      role_id: ROLE_VICTIM,
      candidate_name: 'Candidata Ajena',
      candidate_email: 'ajena@ejemplo-ficticio.test',
      candidate_phone: '+34600000000',
      role_title: 'Backend',
      status: 'completed',
      duration: 1800,
      transcript: [{ role: 'user', content: 'hola', timestamp: 1 }],
      evaluation: { overallScore: 91 },
      source: 'ticket',
      video_url: null,
      date: 1,
    },
  ];
  writeLog.length = 0;
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/candidate-results', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/candidate-results', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const victimRow = (): Row => {
  const row = db.candidate_results.find((candidate) => candidate.id === RESULT_VICTIM);
  if (!row) throw new Error('La fila sembrada desapareció');
  return row;
};

let originalUrl: string | undefined;
let originalKey: string | undefined;

beforeEach(() => {
  originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_KEY;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  vi.restoreAllMocks();
});

describe('PATCH /api/candidate-results — lista blanca de columnas', () => {
  it('rechaza org_id con 400 y no escribe nada (escalada entre organizaciones)', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { org_id: ORG_ATTACKER } }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['org_id']);
    expect(writeLog).toHaveLength(0);
    expect(victimRow().org_id).toBe(ORG_VICTIM);
  });

  it('rechaza org_id incluso acompañado de columnas válidas', async () => {
    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { status: 'completed', org_id: ORG_ATTACKER },
      }),
    );

    expect(res.status).toBe(400);
    expect(writeLog).toHaveLength(0);
    expect(victimRow().org_id).toBe(ORG_VICTIM);
  });

  it('rechaza role_id con 400 y no escribe nada', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { role_id: ROLE_ATTACKER } }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['role_id']);
    expect(writeLog).toHaveLength(0);
    expect(victimRow().role_id).toBe(ROLE_VICTIM);
  });

  it('rechaza id dentro de updates con 400 y no escribe nada', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { id: 'cand-secuestrado' } }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['id']);
    expect(writeLog).toHaveLength(0);
    expect(victimRow().id).toBe(RESULT_VICTIM);
  });

  it('rechaza columnas que el flujo del candidato nunca escribe', async () => {
    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { candidate_email: 'atacante@ejemplo-ficticio.test' },
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['candidate_email']);
    expect(writeLog).toHaveLength(0);
    expect(victimRow().candidate_email).toBe('ajena@ejemplo-ficticio.test');
  });

  it('acepta 200 cuando updates solo trae columnas de la lista blanca', async () => {
    const updates = {
      status: 'completed',
      transcript: [{ role: 'assistant', content: 'listo', timestamp: 2 }],
      duration: 42,
      video_url: 'https://ejemplo-ficticio.supabase.co/video.webm',
      evaluation: { overallScore: 77 },
    };

    const res = await PATCH(patchRequest({ id: RESULT_VICTIM, updates }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(writeLog).toHaveLength(1);
    expect(writeLog[0]).toMatchObject({ table: 'candidate_results', op: 'update' });
    expect(writeLog[0].payload).toEqual(updates);
    expect(victimRow().duration).toBe(42);
  });

  it('rechaza un updates vacío en lugar de emitir un update sin columnas', async () => {
    const res = await PATCH(patchRequest({ id: RESULT_VICTIM, updates: {} }));

    expect(res.status).toBe(400);
    expect(writeLog).toHaveLength(0);
  });

  it('rechaza un status fuera de los del flujo del candidato', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { status: 'hired' } }),
    );

    expect(res.status).toBe(400);
    expect(writeLog).toHaveLength(0);
    expect(victimRow().status).toBe('completed');
  });
});

describe('POST /api/candidate-results — pertenencia de la fila', () => {
  it('crea una fila nueva con 200 y resuelve org_id desde el roleId', async () => {
    const res = await POST(
      postRequest({
        id: 'cand-nuevo',
        roleId: ROLE_ATTACKER,
        candidateName: 'Candidato Nuevo',
        roleTitle: 'Frontend',
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_ATTACKER });
    expect(writeLog).toHaveLength(1);
    expect(db.candidate_results).toHaveLength(2);
    const created = db.candidate_results.find((row) => row.id === 'cand-nuevo');
    expect(created).toMatchObject({ org_id: ORG_ATTACKER, role_id: ROLE_ATTACKER });
  });

  it('responde 403 y deja la fila intacta al pisar un id de otra organización', async () => {
    const before = { ...victimRow() };

    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_ATTACKER,
        candidateName: 'Atacante',
        roleTitle: 'Frontend',
        status: 'in-progress',
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(writeLog).toHaveLength(0);
    expect(victimRow()).toEqual(before);
    expect(db.candidate_results).toHaveLength(1);
  });

  it('responde 403 aunque el cuerpo declare el org_id de la víctima', async () => {
    const before = { ...victimRow() };

    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_ATTACKER,
        orgId: ORG_VICTIM,
        candidateName: 'Atacante',
        roleTitle: 'Frontend',
      }),
    );

    expect(res.status).toBe(403);
    expect(writeLog).toHaveLength(0);
    expect(victimRow()).toEqual(before);
  });

  it('acepta 200 al reescribir un id propio del mismo rol y organización', async () => {
    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_VICTIM,
        candidateName: 'Candidata Ajena',
        roleTitle: 'Backend',
        status: 'completed',
        duration: 1900,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_VICTIM });
    expect(writeLog).toHaveLength(1);
    expect(victimRow()).toMatchObject({
      org_id: ORG_VICTIM,
      role_id: ROLE_VICTIM,
      duration: 1900,
    });
  });

  it('responde 422 y no escribe cuando el roleId no resuelve a ninguna organización', async () => {
    const res = await POST(
      postRequest({
        id: 'cand-sin-rol',
        roleId: 'role-inexistente',
        orgId: ORG_ATTACKER,
        candidateName: 'Sin Rol',
      }),
    );

    expect(res.status).toBe(422);
    expect(writeLog).toHaveLength(0);
    expect(db.candidate_results).toHaveLength(1);
  });
});
