/**
 * Cliente de Supabase falso, mínimo y compartido por las suites del flujo de
 * invitaciones.
 *
 * Imita solo las operaciones que usa `src/lib/invites/service.ts` y
 * `applyToJob`: `select().eq().maybeSingle()`, `select().eq().eq().maybeSingle()`
 * e `insert()`. Las escrituras se aplican de verdad sobre las tablas en memoria
 * y se registran en `writes`, de modo que una prueba pueda afirmar tanto "la
 * fila quedó así" como "no hubo ninguna escritura".
 *
 * No es un doble del comportamiento de Postgres: no hay RLS, ni tipos, ni
 * claves foráneas. Lo que se verifica con él es la lógica de la aplicación
 * (qué se escribe, en qué tabla, con qué valores y en qué orden), no la base.
 */

export type FakeRow = Record<string, unknown>;

export type FakeTables = Record<string, FakeRow[]>;

export interface FakeWrite {
  table: string;
  op: 'insert';
  payload: FakeRow;
}

/** Error que la tabla debe devolver en su próxima inserción. */
export interface FakeInsertError {
  message: string;
}

export interface FakeSupabase {
  /** Objeto con la forma que consume el código bajo prueba. */
  client: { from: (table: string) => FakeQueryBuilder };
  /** Tablas en memoria. Se puede leer y sembrar directamente. */
  tables: FakeTables;
  /** Escrituras en orden de ejecución. */
  writes: FakeWrite[];
  /** Errores encolados por tabla para forzar el camino de fallo. */
  insertErrors: Map<string, FakeInsertError>;
  reset: (seed?: FakeTables) => void;
}

interface QueryOutcome {
  data: FakeRow | FakeRow[] | null;
  error: FakeInsertError | null;
}

export interface FakeQueryBuilder {
  select: (columns?: string) => FakeQueryBuilder;
  insert: (payload: FakeRow) => FakeQueryBuilder;
  eq: (column: string, value: unknown) => FakeQueryBuilder;
  maybeSingle: () => Promise<QueryOutcome>;
  single: () => Promise<QueryOutcome>;
  then: <T>(resolve: (value: QueryOutcome) => T) => Promise<T>;
}

export function createFakeSupabase(seed: FakeTables = {}): FakeSupabase {
  const state: FakeSupabase = {
    client: { from: (table: string) => createBuilder(table) },
    tables: {},
    writes: [],
    insertErrors: new Map(),
    reset: (nextSeed: FakeTables = {}) => {
      state.tables = cloneTables(nextSeed);
      state.writes = [];
      state.insertErrors = new Map();
    },
  };

  function rowsOf(table: string): FakeRow[] {
    state.tables[table] = state.tables[table] ?? [];
    return state.tables[table];
  }

  function createBuilder(table: string): FakeQueryBuilder {
    const filters: Array<[string, unknown]> = [];
    let operation: 'select' | 'insert' = 'select';
    let payload: FakeRow = {};

    const exec = (): QueryOutcome => {
      if (operation === 'insert') {
        const failure = state.insertErrors.get(table);
        if (failure) {
          state.insertErrors.delete(table);
          return { data: null, error: failure };
        }
        state.writes.push({ table, op: 'insert', payload });
        rowsOf(table).push({ ...payload });
        return { data: [payload], error: null };
      }

      const matching = rowsOf(table).filter((row) =>
        filters.every(([column, value]) => row[column] === value),
      );
      return { data: matching, error: null };
    };

    const builder: FakeQueryBuilder = {
      select: () => builder,
      insert: (next: FakeRow) => {
        operation = 'insert';
        payload = next;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return builder;
      },
      maybeSingle: async () => firstRow(exec()),
      single: async () => firstRow(exec()),
      then: <T>(resolve: (value: QueryOutcome) => T) =>
        Promise.resolve(exec()).then(resolve),
    };

    return builder;
  }

  state.reset(seed);
  return state;
}

function firstRow(outcome: QueryOutcome): QueryOutcome {
  const rows = Array.isArray(outcome.data) ? outcome.data : [];
  return { data: rows[0] ?? null, error: outcome.error };
}

function cloneTables(seed: FakeTables): FakeTables {
  const copy: FakeTables = {};
  for (const [table, rows] of Object.entries(seed)) {
    copy[table] = rows.map((row) => ({ ...row }));
  }
  return copy;
}
