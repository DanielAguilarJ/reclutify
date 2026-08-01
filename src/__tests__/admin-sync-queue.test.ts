import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Cola de reintento de `adminStore`.
 *
 * POR QUÉ ESTE ARCHIVO
 * --------------------
 * Es el único mecanismo del producto cuya razón de existir es no perder datos del candidato
 * cuando la escritura a Supabase falla, y no tenía ninguna prueba. Tres de sus cuatro problemas
 * consistían en perder exactamente lo que venía a proteger:
 *
 *  1. `attempts` se incrementaba y se guardaba, pero no se leía para decidir nada: una entrada
 *     que falla siempre se reintentaba en cada carga del panel durante catorce días.
 *  2. `writeSyncQueue(remaining)` al final del recorrido pisaba lo encolado durante los `await`.
 *  3. Dos llamadas concurrentes recorrían la misma cola y se pisaban el resultado.
 *  4. `JSON.parse(raw) as SyncQueueItem[]`: un `as` sin validar sobre almacenamiento del cliente.
 *
 * CÓMO SE PRUEBA
 * --------------
 * Todas las escrituras de la cola pasan por `fetch` a `/api/candidate-results`, así que se
 * sustituye `fetch` y se inspecciona `localStorage`. No se simula Supabase: la cola no lo usa.
 */

const QUEUE_KEY = 'reclutify_sync_queue';

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      upsert: async () => ({ error: null }),
    }),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  }),
}));

/** Entrada de cola mínima que el esquema acepta. */
function queueItem(id: string, attempts = 0) {
  return {
    id,
    kind: 'candidate_update' as const,
    candidateId: `cand-${id}`,
    payload: { status: 'completed' },
    createdAt: Date.now(),
    attempts,
  };
}

/** Lee la cola tal como está en `localStorage`. */
function storedQueue(): Array<{ id: string; attempts: number }> {
  const raw = localStorage.getItem(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/** Importa el store recién, para que el mutex de módulo no arrastre estado entre pruebas. */
async function freshStore() {
  vi.resetModules();
  const mod = await import('@/store/adminStore');
  return mod.useAdminStore;
}

describe('cola de reintento de adminStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('tope de intentos', () => {
    it('descarta una entrada que ya acumula el máximo de fallos', async () => {
      // `attempts: 7` con el tope en 8: este fallo es el octavo y la entrada se va.
      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('a', 7)]));
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'role not found' }), { status: 422 })),
      );

      const useAdminStore = await freshStore();
      await useAdminStore.getState().retrySyncQueue();

      expect(storedQueue()).toEqual([]);
      expect(useAdminStore.getState().pendingSyncCount).toBe(0);
    });

    it('conserva y cuenta el intento cuando aún no llega al tope', async () => {
      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('a', 2)]));
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ error: 'network' }), { status: 500 })),
      );

      const useAdminStore = await freshStore();
      await useAdminStore.getState().retrySyncQueue();

      const queue = storedQueue();
      expect(queue).toHaveLength(1);
      expect(queue[0].attempts).toBe(3);
    });

    it('un fallo permanente termina descartándose en vez de reintentarse sin fin', async () => {
      // Es el comportamiento que faltaba: antes, este bucle no acababa nunca.
      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('a', 0)]));
      const fetchSpy = vi.fn(
        async () => new Response(JSON.stringify({ error: 'gone' }), { status: 410 }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      const useAdminStore = await freshStore();
      for (let i = 0; i < 12; i++) {
        await useAdminStore.getState().retrySyncQueue();
      }

      expect(storedQueue()).toEqual([]);
      // Ocho intentos y para. Sin el tope serían doce, y en producción una por carga de panel.
      expect(fetchSpy).toHaveBeenCalledTimes(8);
    });
  });

  describe('no pierde lo encolado durante el recorrido', () => {
    it('conserva una entrada añadida mientras el reintento estaba en vuelo', async () => {
      // Es la pérdida de datos que tenía el mecanismo. La entrada nueva se escribe en
      // `localStorage` durante el `await`, justo como hace `addCandidate` al agotar sus
      // reintentos — que es cuando la red va mal, que es cuando esto está corriendo.
      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('vieja', 0)]));

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const current = storedQueue();
          localStorage.setItem(QUEUE_KEY, JSON.stringify([...current, queueItem('nueva', 0)]));
          return new Response(JSON.stringify({}), { status: 200 });
        }),
      );

      const useAdminStore = await freshStore();
      await useAdminStore.getState().retrySyncQueue();

      const ids = storedQueue().map((i) => i.id);
      expect(ids).toContain('nueva');
      // La vieja sí se sincronizó, así que se va.
      expect(ids).not.toContain('vieja');
    });

    it('conserva la nueva incluso cuando la vieja falla y se queda', async () => {
      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('vieja', 0)]));

      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const current = storedQueue();
          localStorage.setItem(QUEUE_KEY, JSON.stringify([...current, queueItem('nueva', 0)]));
          return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
        }),
      );

      const useAdminStore = await freshStore();
      await useAdminStore.getState().retrySyncQueue();

      const ids = storedQueue().map((i) => i.id).sort();
      expect(ids).toEqual(['nueva', 'vieja']);
      expect(useAdminStore.getState().pendingSyncCount).toBe(2);
    });
  });

  describe('dos llamadas concurrentes no se pisan', () => {
    it('comparte el recorrido en vuelo en lugar de lanzar otro', async () => {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify([queueItem('a', 0), queueItem('b', 0)]),
      );

      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      const fetchSpy = vi.fn(async () => {
        await gate;
        return new Response(JSON.stringify({}), { status: 200 });
      });
      vi.stubGlobal('fetch', fetchSpy);

      const useAdminStore = await freshStore();

      // Es lo que ocurre con dos navegaciones seguidas al panel: `fetchFromSupabase` dispara
      // `retrySyncQueue` al terminar.
      const first = useAdminStore.getState().retrySyncQueue();
      const second = useAdminStore.getState().retrySyncQueue();

      release();
      await Promise.all([first, second]);

      // Dos entradas, una petición cada una. Sin el mutex serían cuatro.
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(storedQueue()).toEqual([]);
    });

    it('un segundo recorrido posterior sí se ejecuta', async () => {
      // El mutex debe soltarse: si quedara pegado, la cola no se reintentaría nunca más.
      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('a', 0)]));
      const fetchSpy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);

      const useAdminStore = await freshStore();
      await useAdminStore.getState().retrySyncQueue();

      localStorage.setItem(QUEUE_KEY, JSON.stringify([queueItem('b', 0)]));
      await useAdminStore.getState().retrySyncQueue();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('validación de lo que sale de localStorage', () => {
    it('descarta entradas con forma inesperada y conserva las válidas', async () => {
      localStorage.setItem(
        QUEUE_KEY,
        JSON.stringify([
          queueItem('buena', 0),
          { id: 'sin-kind', candidateId: 'x', createdAt: Date.now(), attempts: 0 },
          { kind: 'candidate_update', candidateId: 'y' },
          'una cadena',
          null,
          { ...queueItem('kind-desconocido', 0), kind: 'lo_que_sea' },
        ]),
      );

      const fetchSpy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
      vi.stubGlobal('fetch', fetchSpy);

      const useAdminStore = await freshStore();
      await useAdminStore.getState().retrySyncQueue();

      // Solo la válida llega a la red. Antes, `kind: 'lo_que_sea'` caía en el `else` del
      // recorrido —`candidate_upsert_needs_org`— y enviaba basura al endpoint.
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(storedQueue()).toEqual([]);
    });

    it('sobrevive a un JSON que no es un array', async () => {
      localStorage.setItem(QUEUE_KEY, JSON.stringify({ no: 'es un array' }));
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const useAdminStore = await freshStore();
      await expect(useAdminStore.getState().retrySyncQueue()).resolves.toBeUndefined();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(useAdminStore.getState().pendingSyncCount).toBe(0);
    });

    it('sobrevive a un JSON corrupto', async () => {
      localStorage.setItem(QUEUE_KEY, '{esto no es json');
      const useAdminStore = await freshStore();

      await expect(useAdminStore.getState().retrySyncQueue()).resolves.toBeUndefined();
      expect(useAdminStore.getState().pendingSyncCount).toBe(0);
    });
  });

  it('una cola vacía no hace ninguna petición', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const useAdminStore = await freshStore();
    await useAdminStore.getState().retrySyncQueue();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useAdminStore.getState().pendingSyncCount).toBe(0);
  });
});
