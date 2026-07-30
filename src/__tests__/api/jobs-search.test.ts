// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar los server actions.
vi.mock('server-only', () => ({}));

/**
 * Pruebas de las lecturas PÚBLICAS de vacantes.
 *
 * El agujero que cierran: `GET /api/jobs/search` (y las dos lecturas del portal
 * que comparten su proyección) devolvía `roles.topics` tal cual, con la rúbrica
 * de cada criterio dentro — `weight` y los descriptores `poor` / `acceptable` /
 * `excellent`, que es el guion con el que la IA califica al candidato. La
 * respuesta se sirve sin sesión y además cacheada, así que estaba a la vista de
 * cualquiera.
 *
 * Las aserciones son sobre el CUERPO SERIALIZADO de la respuesta, no sobre las
 * claves que se le ocurra mirar a la prueba: lo que importa es lo que cruza la
 * red.
 *
 * Los server actions viven en el mismo archivo porque son la misma lectura con la
 * misma proyección y el mismo doble de Supabase; separarlos solo duplicaría el
 * andamio.
 */

/** Consulta que la ruta armó, tal como la vería PostgREST. */
interface RecordedQuery {
  table: string;
  columns: string;
  filters: string[];
}

const recorded: RecordedQuery[] = [];

/** Filas que el doble de Supabase devolverá en la próxima consulta. */
let rows: unknown[] = [];
/** Error que el doble devolverá en la próxima consulta. */
let queryError: { message: string } | null = null;

interface QueryOutcome {
  data: unknown[] | unknown | null;
  count: number | null;
  error: { message: string } | null;
}

/**
 * Doble mínimo del constructor de consultas de supabase-js.
 *
 * Solo encadena lo que usan estas lecturas (`select`, `eq`, `order`, `range`,
 * `or`, `ilike`, `single`) y es "thenable", igual que el real. No filtra nada: lo
 * que se verifica aquí es la proyección, no la semántica de Postgres.
 */
function createQueryBuilder(table: string) {
  const entry: RecordedQuery = { table, columns: '', filters: [] };
  recorded.push(entry);

  const outcome = (single: boolean): QueryOutcome => ({
    data: queryError ? null : single ? (rows[0] ?? null) : rows,
    count: queryError ? null : rows.length,
    error: queryError,
  });

  const builder = {
    select(columns: string) {
      entry.columns = columns;
      return builder;
    },
    eq(column: string, value: unknown) {
      entry.filters.push(`${column}=${String(value)}`);
      return builder;
    },
    or(expression: string) {
      entry.filters.push(`or(${expression})`);
      return builder;
    },
    ilike(column: string, pattern: string) {
      entry.filters.push(`${column}~${pattern}`);
      return builder;
    },
    order() {
      return builder;
    },
    range() {
      return builder;
    },
    not() {
      return builder;
    },
    single: async () => outcome(true),
    maybeSingle: async () => outcome(true),
    then: <T>(resolve: (value: QueryOutcome) => T) =>
      Promise.resolve(outcome(false)).then(resolve),
  };

  return builder;
}

const supabaseDouble = { from: (table: string) => createQueryBuilder(table) };

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => supabaseDouble,
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('las lecturas públicas no deben usar la clave de servicio');
  },
}));

import { GET } from '@/app/api/jobs/search/route';
import { getJobById, getPublishedJobs } from '@/app/actions/jobs';
import { PUBLIC_JOB_COLUMNS } from '@/lib/jobs/public-projection';

/** Fila cruda de `roles`: la rúbrica llega dentro de `topics`, como en producción. */
const roleRow = {
  id: 'role-1',
  org_id: 'org-1',
  title: 'Backend Engineer',
  description: 'Construir servicios.',
  location: 'CDMX',
  salary: '60k',
  job_type: 'remote',
  published_at: '2026-01-01T00:00:00.000Z',
  topics: [
    {
      id: 'topic-1',
      label: 'Diseño de sistemas',
      score: 7,
      rubric: {
        excellent: 'Explica trade-offs y cuellos de botella.',
        acceptable: 'Describe una arquitectura razonable.',
        poor: 'No distingue capas.',
        weight: 9,
      },
    },
  ],
  organizations: { name: 'Acme', slug: 'acme', logo_url: null },
};

/** Rastros de la rúbrica que no pueden aparecer en una respuesta pública. */
const RUBRIC_MARKERS = [
  'rubric',
  'weight',
  'excellent',
  'acceptable',
  'poor',
  'score',
  'trade-offs',
  'arquitectura razonable',
  'No distingue capas',
];

function expectSinRubrica(payload: string): void {
  for (const marker of RUBRIC_MARKERS) {
    expect(payload).not.toContain(marker);
  }
}

beforeEach(() => {
  recorded.length = 0;
  rows = [roleRow];
  queryError = null;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/jobs/search', () => {
  it('no devuelve la rúbrica de los criterios de evaluación', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/jobs/search?q=backend&page=1')
    );

    expect(response.status).toBe(200);

    // Se inspecciona el cuerpo tal cual sale: si la rúbrica volviera por
    // cualquier campo, aquí falla.
    const body = await response.text();
    expectSinRubrica(body);

    const payload = JSON.parse(body) as {
      jobs: { id: string; topics: unknown }[];
      total: number;
      hasMore: boolean;
    };

    expect(payload.total).toBe(1);
    expect(payload.jobs).toHaveLength(1);
    expect(payload.jobs[0].topics).toEqual([
      { id: 'topic-1', label: 'Diseño de sistemas' },
    ]);
  });

  it('consulta `roles` con la proyección pública compartida', async () => {
    await GET(new NextRequest('http://localhost/api/jobs/search?page=1'));

    const [query] = recorded;
    expect(query.table).toBe('roles');
    expect(query.columns).toBe(PUBLIC_JOB_COLUMNS);
    expect(query.filters).toContain('is_published=true');
  });

  it('sigue devolviendo el listado vacío cuando la consulta falla', async () => {
    queryError = { message: 'consulta rechazada' };

    const response = await GET(new NextRequest('http://localhost/api/jobs/search'));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      jobs: [],
      total: 0,
      hasMore: false,
    });
  });
});

describe('lecturas públicas del portal (server actions)', () => {
  it('getPublishedJobs entrega las etiquetas sin rúbrica', async () => {
    const result = await getPublishedJobs({ page: 1, perPage: 12 });

    expect(recorded[0].columns).toBe(PUBLIC_JOB_COLUMNS);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].topics).toEqual([
      { id: 'topic-1', label: 'Diseño de sistemas' },
    ]);
    expectSinRubrica(JSON.stringify(result));
  });

  it('getJobById entrega las etiquetas sin rúbrica', async () => {
    const job = await getJobById('role-1');

    expect(recorded[0].columns).toBe(PUBLIC_JOB_COLUMNS);
    expect(job?.topics).toEqual([{ id: 'topic-1', label: 'Diseño de sistemas' }]);
    expectSinRubrica(JSON.stringify(job));
  });
});
