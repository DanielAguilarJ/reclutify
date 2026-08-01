import { vi } from 'vitest';

/**
 * Espía encadenable del constructor de consultas de Supabase.
 *
 * POR QUÉ NO SE USA `createFakeSupabase`
 * --------------------------------------
 * `src/__tests__/helpers/fake-supabase.ts` es una base en memoria: aplica las escrituras de
 * verdad y sirve para afirmar «la fila quedó así». Es lo correcto para los flujos de
 * invitación, ticket y resultados.
 *
 * Pero lo que hay que comprobar en las server actions de seguridad es distinto: **qué
 * consulta se construyó**. En `searchProfiles`, el fallo era que el término del usuario se
 * interpolaba en el argumento de `.or()`, que es la gramática de filtros de PostgREST y no
 * un valor parametrizado. La prueba que lo fija tiene que leer la cadena exacta que se le
 * pasó a `.or()`; una base en memoria que devuelve filas correctas no lo detectaría, porque
 * el ataque no cambia el RESULTADO, cambia la CONSULTA.
 *
 * Este espía registra cada eslabón de la cadena con sus argumentos y resuelve con lo que la
 * prueba configure. Además soporta los métodos que el otro doble no tiene (`or`, `in`,
 * `ilike`, `limit`, `order`, `overlaps`, `not`), sin implementar su semántica: para estas
 * pruebas la semántica no importa, importa la llamada.
 */

/** Una llamada registrada de la cadena. */
export interface RecordedCall {
  method: string;
  args: unknown[];
}

export interface QuerySpyResult {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}

export interface QuerySpy {
  /** Objeto con la forma de `SupabaseClient` que consume el código bajo prueba. */
  client: { from: (table: string) => unknown; auth: { getUser: () => Promise<unknown> } };
  /** Cada `.from(...)` con la tabla pedida, en orden. */
  tables: string[];
  /** Toda la cadena, en orden, con sus argumentos. */
  calls: RecordedCall[];
  /** Argumentos de la última llamada a un método concreto, o `undefined`. */
  argsOf: (method: string) => unknown[] | undefined;
  /** Todas las llamadas a un método concreto. */
  allCallsOf: (method: string) => RecordedCall[];
  /** Configura el resultado que devuelve la cadena de una tabla. */
  setResult: (table: string, result: QuerySpyResult) => void;
  /** Configura el usuario que devuelve `auth.getUser()`. `null` = sin sesión. */
  setUser: (user: { id: string; email?: string } | null) => void;
}

/**
 * Métodos que TERMINAN la cadena y devuelven la promesa.
 *
 * `then` está aquí porque el código a veces hace `await query` sin terminador explícito: el
 * `await` invoca `then`, así que el objeto tiene que ser una promesa válida.
 */
const TERMINALS = new Set(['single', 'maybeSingle', 'then', 'csv']);

/**
 * Construye el espía.
 *
 * @param initial Resultados por tabla, para no tener que configurarlos en cada prueba.
 */
export function createQuerySpy(initial: Record<string, QuerySpyResult> = {}): QuerySpy {
  const tables: string[] = [];
  const calls: RecordedCall[] = [];
  const results = new Map<string, QuerySpyResult>(Object.entries(initial));

  let currentUser: { id: string; email?: string } | null = { id: 'usuario-de-prueba' };

  /** Resultado configurado para una tabla, con el vacío por defecto. */
  const resultFor = (table: string): QuerySpyResult =>
    results.get(table) ?? { data: null, error: null, count: null };

  /**
   * Constructor encadenable.
   *
   * Se implementa con `Proxy` en lugar de enumerar los métodos: la lista de operadores de
   * PostgREST es larga y crece, y una prueba que falla porque el doble no conoce `.overlaps`
   * señala al doble en vez de al código, que es exactamente el ruido que hay que evitar.
   */
  function makeBuilder(table: string): unknown {
    const target = {};

    return new Proxy(target, {
      get(_t, property: string | symbol) {
        if (typeof property !== 'string') return undefined;

        // `await builder` entra por aquí.
        if (property === 'then') {
          return (resolve: (value: QuerySpyResult) => unknown) => {
            calls.push({ method: 'then', args: [] });
            return Promise.resolve(resolve(resultFor(table)));
          };
        }

        return (...args: unknown[]) => {
          calls.push({ method: property, args });

          if (TERMINALS.has(property)) {
            return Promise.resolve(resultFor(table));
          }

          // Cualquier otro método devuelve la propia cadena.
          return makeBuilder(table);
        };
      },
    });
  }

  return {
    client: {
      from: (table: string) => {
        tables.push(table);
        return makeBuilder(table);
      },
      auth: {
        getUser: async () => ({ data: { user: currentUser }, error: null }),
      },
    },
    tables,
    calls,
    argsOf: (method) => [...calls].reverse().find((call) => call.method === method)?.args,
    allCallsOf: (method) => calls.filter((call) => call.method === method),
    setResult: (table, result) => results.set(table, result),
    setUser: (user) => {
      currentUser = user;
    },
  };
}

/** Doble de `console` que no ensucia la salida de las pruebas. */
export function silenceConsole(): void {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
}
