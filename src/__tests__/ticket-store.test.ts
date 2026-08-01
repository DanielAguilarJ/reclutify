import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura de `ticketStore`.
 *
 * POR QUÉ ESTE ARCHIVO
 * --------------------
 * `syncAddTicket` fue el defecto documentado en la sección 2.33 del reporte: devolvía `void` y
 * en producción se tragaba cualquier fallo (`if (NODE_ENV === 'development')`), así que el
 * admin copiaba un enlace que el candidato recibía como un 404, sin que nadie se enterara. Ahora
 * devuelve un resultado con motivo, y estos tests verifican que sigue así para los tres motivos
 * posibles: sin sesión, sin organización, y fallo de escritura.
 */

/** Qué debe simular el `createClient` falso en la próxima llamada. */
interface MockScenario {
  hasUser: boolean;
  orgId: string | null;
  writeFails: boolean;
}

let scenario: MockScenario = { hasUser: true, orgId: 'org-1', writeFails: false };

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: scenario.hasUser ? { id: 'u1' } : null },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { org_id: scenario.orgId }, error: null }),
            }),
          }),
        };
      }
      if (table === 'interview_tickets') {
        return {
          upsert: async () => ({
            error: scenario.writeFails ? { message: 'boom' } : null,
          }),
          select: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`Tabla no simulada: ${table}`);
    },
  }),
}));

async function freshStore() {
  vi.resetModules();
  const { useTicketStore } = await import('@/store/ticketStore');
  return useTicketStore;
}

function makeTicket() {
  return {
    id: 'ticket-1',
    token: 'tok-abc',
    candidateName: 'Alguien',
    roleId: 'role-1',
    language: 'es' as const,
    createdAt: Date.now(),
    expiresAt: Date.now() + 86_400_000,
    used: false,
  };
}

describe('ticketStore', () => {
  beforeEach(() => {
    scenario = { hasUser: true, orgId: 'org-1', writeFails: false };
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('addTicket', () => {
    it('genera un ticket local con token y expiración a 24 horas', async () => {
      const store = await freshStore();
      const before = Date.now();
      const ticket = store.getState().addTicket('Alguien', 'role-1', 'es');

      expect(ticket.candidateName).toBe('Alguien');
      expect(ticket.roleId).toBe('role-1');
      expect(ticket.used).toBe(false);
      expect(ticket.expiresAt - ticket.createdAt).toBe(24 * 60 * 60 * 1000);
      expect(ticket.createdAt).toBeGreaterThanOrEqual(before);
    });

    it('lo antepone a la lista local', async () => {
      const store = await freshStore();
      store.getState().addTicket('Primero', 'role-1', 'es');
      store.getState().addTicket('Segundo', 'role-1', 'es');

      expect(store.getState().tickets.map((t) => t.candidateName)).toEqual(['Segundo', 'Primero']);
    });
  });

  describe('syncAddTicket', () => {
    it('devuelve { ok: true } cuando todo funciona', async () => {
      const store = await freshStore();
      const result = await store.getState().syncAddTicket(makeTicket());

      expect(result).toEqual({ ok: true });
    });

    it('DEVUELVE el resultado en vez de devolver void', async () => {
      // Era exactamente el defecto: antes de la corrección, esta función no devolvía nada
      // utilizable y el llamante no podía saber si el ticket llegó a la base.
      const store = await freshStore();
      const result = await store.getState().syncAddTicket(makeTicket());

      expect(result).not.toBeUndefined();
      expect(typeof result.ok).toBe('boolean');
    });

    it('sin sesión: devuelve el motivo "no-session" y lo registra en consola', async () => {
      scenario.hasUser = false;
      const store = await freshStore();
      const result = await store.getState().syncAddTicket(makeTicket());

      expect(result).toEqual({ ok: false, reason: 'no-session' });
      expect(console.error).toHaveBeenCalled();
    });

    it('sin organización resuelta: devuelve "no-organization"', async () => {
      scenario.orgId = null;
      const store = await freshStore();
      const result = await store.getState().syncAddTicket(makeTicket());

      expect(result).toEqual({ ok: false, reason: 'no-organization' });
      expect(console.error).toHaveBeenCalled();
    });

    it('fallo de escritura: devuelve "write-failed" y NO SE SILENCIA EN PRODUCCIÓN', async () => {
      // El defecto original condicionaba el aviso a `NODE_ENV === 'development'`. Se comprueba
      // que `console.error` se llama sin depender de esa variable de entorno.
      const originalEnv = process.env.NODE_ENV;
      // @ts-expect-error -- se fuerza a 'production' para probar exactamente el camino que
      // antes se tragaba el error.
      process.env.NODE_ENV = 'production';

      try {
        scenario.writeFails = true;
        const store = await freshStore();
        const result = await store.getState().syncAddTicket(makeTicket());

        expect(result).toEqual({ ok: false, reason: 'write-failed' });
        expect(console.error).toHaveBeenCalled();
      } finally {
        // @ts-expect-error -- se restaura el valor real del entorno de pruebas.
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('una excepción inesperada también se reporta como "write-failed"', async () => {
      vi.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          auth: {
            getUser: async () => {
              throw new Error('conexión perdida');
            },
          },
        }),
      }));

      const store = await freshStore();
      const result = await store.getState().syncAddTicket(makeTicket());

      expect(result).toEqual({ ok: false, reason: 'write-failed' });
    });
  });

  describe('fetchTickets', () => {
    it('en fallo, reporta el error sin reventar', async () => {
      vi.doMock('@/utils/supabase/client', () => ({
        createClient: () => ({
          from: () => ({
            select: () => ({
              order: async () => ({ data: null, error: { message: 'caído' } }),
            }),
          }),
        }),
      }));

      const store = await freshStore();
      await store.getState().fetchTickets();

      expect(store.getState().error).toBeTruthy();
      expect(store.getState().loading).toBe(false);
    });
  });
});
