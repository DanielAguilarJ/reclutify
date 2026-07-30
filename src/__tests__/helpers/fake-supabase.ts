/**
 * Cliente de Supabase falso, mínimo y compartido por las suites de los flujos
 * públicos (invitaciones, ticket de entrevista y sesión de informes).
 *
 * Imita solo las operaciones que usan `src/lib/invites/service.ts`,
 * `applyToJob`, `src/lib/interview-tickets/service.ts`,
 * `src/lib/info-sessions/service.ts` y `/api/candidate-results`:
 * `select().eq().maybeSingle()`, `select().eq().eq().maybeSingle()`,
 * `insert().select().single()`, `upsert()`, `update().eq()`,
 * `update().eq().eq().select()` y `update().eq().not().select()`. Las escrituras
 * se aplican de verdad sobre las tablas en memoria y se registran en `writes`, de
 * modo que una prueba pueda afirmar tanto "la fila quedó así" como "no hubo
 * ninguna escritura".
 *
 * No es un doble del comportamiento de Postgres: no hay RLS, ni tipos, ni
 * claves foráneas. Lo que se verifica con él es la lógica de la aplicación
 * (qué se escribe, en qué tabla, con qué valores y en qué orden), no la base.
 */

export type FakeRow = Record<string, unknown>;

export type FakeTables = Record<string, FakeRow[]>;

export interface FakeWrite {
  table: string;
  op: 'insert' | 'update' | 'upsert';
  payload: FakeRow;
}

/** Error que la tabla debe devolver en su próxima escritura. */
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
  /** Errores encolados por tabla para forzar el camino de fallo del `insert`. */
  insertErrors: Map<string, FakeInsertError>;
  /** Errores encolados por tabla para forzar el camino de fallo del `update`. */
  updateErrors: Map<string, FakeInsertError>;
  /** Errores encolados por tabla para forzar el camino de fallo del `upsert`. */
  upsertErrors: Map<string, FakeInsertError>;
  /** Errores encolados por tabla para forzar el camino de fallo del `select`. */
  selectErrors: Map<string, FakeInsertError>;
  reset: (seed?: FakeTables) => void;
}

interface QueryOutcome {
  data: FakeRow | FakeRow[] | null;
  error: FakeInsertError | null;
}

export interface FakeQueryBuilder {
  select: (columns?: string) => FakeQueryBuilder;
  insert: (payload: FakeRow) => FakeQueryBuilder;
  update: (payload: FakeRow) => FakeQueryBuilder;
  /**
   * `upsert` por clave primaria `id`, que es la que usa
   * `/api/candidate-results`. Si la fila existe se fusiona; si no, se inserta.
   */
  upsert: (payload: FakeRow) => FakeQueryBuilder;
  eq: (column: string, value: unknown) => FakeQueryBuilder;
  /**
   * Filtro negado. Solo se implementa el operador `is`, que es el que usa
   * `consumeInterviewTicket` para exigir `used IS NOT TRUE`. Cualquier otro
   * operador lanza, para que la prueba falle de forma evidente en lugar de
   * simular una semántica que este doble no tiene.
   */
  not: (column: string, operator: string, value: unknown) => FakeQueryBuilder;
  maybeSingle: () => Promise<QueryOutcome>;
  single: () => Promise<QueryOutcome>;
  then: <T>(resolve: (value: QueryOutcome) => T) => Promise<T>;
}

export function createFakeSupabase(seed: FakeTables = {}): FakeSupabase {
  /**
   * Contador de las claves primarias que "genera la base" en un `INSERT` que no
   * las trae. Es determinista y se reinicia con `reset`, así que una prueba puede
   * afirmar sobre el identificador devuelto sin depender del azar.
   */
  let generatedIds = 0;

  /**
   * Identificador con forma de UUID (versión 4, variante RFC 4122) para que
   * valga en los esquemas que exigen `uuid`.
   */
  const nextGeneratedId = (): string =>
    `00000000-0000-4000-8000-${String(++generatedIds).padStart(12, '0')}`;

  const state: FakeSupabase = {
    client: { from: (table: string) => createBuilder(table) },
    tables: {},
    writes: [],
    insertErrors: new Map(),
    updateErrors: new Map(),
    upsertErrors: new Map(),
    selectErrors: new Map(),
    reset: (nextSeed: FakeTables = {}) => {
      state.tables = cloneTables(nextSeed);
      state.writes = [];
      generatedIds = 0;
      state.insertErrors = new Map();
      state.updateErrors = new Map();
      state.upsertErrors = new Map();
      state.selectErrors = new Map();
    },
  };

  function rowsOf(table: string): FakeRow[] {
    state.tables[table] = state.tables[table] ?? [];
    return state.tables[table];
  }

  function createBuilder(table: string): FakeQueryBuilder {
    const filters: Array<(row: FakeRow) => boolean> = [];
    let operation: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: FakeRow = {};

    const matching = (): FakeRow[] =>
      rowsOf(table).filter((row) => filters.every((filter) => filter(row)));

    const exec = (): QueryOutcome => {
      if (operation === 'upsert') {
        const failure = state.upsertErrors.get(table);
        if (failure) {
          state.upsertErrors.delete(table);
          return { data: null, error: failure };
        }
        state.writes.push({ table, op: 'upsert', payload });
        const rows = rowsOf(table);
        const index = rows.findIndex((row) => row.id === payload.id);
        if (index >= 0) rows[index] = { ...rows[index], ...payload };
        else rows.push({ ...payload });
        return { data: [payload], error: null };
      }

      if (operation === 'insert') {
        const failure = state.insertErrors.get(table);
        if (failure) {
          state.insertErrors.delete(table);
          return { data: null, error: failure };
        }
        state.writes.push({ table, op: 'insert', payload });
        // Postgres rellena la clave primaria con su `DEFAULT` cuando el `INSERT`
        // no la trae, y eso es lo que devuelve `.select('id')`. Sin ese detalle
        // no se puede probar un flujo que necesita el identificador generado
        // —`createInfoSession` lo devuelve al cliente—. `writes` conserva el
        // payload ORIGINAL: el identificador lo puso la base, no la aplicación.
        const inserted: FakeRow = { ...payload };
        if (inserted.id === undefined) inserted.id = nextGeneratedId();
        rowsOf(table).push(inserted);
        return { data: [inserted], error: null };
      }

      if (operation === 'update') {
        const failure = state.updateErrors.get(table);
        if (failure) {
          state.updateErrors.delete(table);
          return { data: null, error: failure };
        }
        const targets = matching();
        // Un `UPDATE` que no alcanza ninguna fila no es una escritura: así la
        // prueba puede exigir "cero escrituras" cuando el filtro protege la
        // fila.
        if (targets.length === 0) return { data: [], error: null };

        state.writes.push({ table, op: 'update', payload });
        for (const target of targets) {
          Object.assign(target, payload);
        }
        return { data: targets, error: null };
      }

      const selectFailure = state.selectErrors.get(table);
      if (selectFailure) {
        state.selectErrors.delete(table);
        return { data: null, error: selectFailure };
      }

      return { data: matching(), error: null };
    };

    const builder: FakeQueryBuilder = {
      select: () => builder,
      insert: (next: FakeRow) => {
        operation = 'insert';
        payload = next;
        return builder;
      },
      update: (next: FakeRow) => {
        operation = 'update';
        payload = next;
        return builder;
      },
      upsert: (next: FakeRow) => {
        operation = 'upsert';
        payload = next;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return builder;
      },
      not: (column: string, operator: string, value: unknown) => {
        if (operator !== 'is') {
          throw new Error(`Operador no simulado en el doble de Supabase: not.${operator}`);
        }
        filters.push((row) => row[column] !== value);
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
