import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Role } from '@/types';

/**
 * Reversión de las escrituras optimistas de puestos.
 *
 * POR QUÉ ESTE ARCHIVO
 * --------------------
 * Las tres acciones de rol aplicaban el cambio en local, fallaban contra Supabase, lo registraban
 * en consola y dejaban el estado divergente sin revertir ni avisar a nadie.
 *
 *  - `removeRole` era el peor: el puesto desaparecía de la pantalla y seguía existiendo —y
 *    publicado— en la base, así que el admin creía haberlo retirado y los candidatos seguían
 *    pudiendo entrar.
 *  - `addRole` tampoco era inocuo: `create-role` lo espera y a continuación crea tickets contra
 *    ese id, así que los tickets apuntaban a un puesto inexistente.
 */

/** Controla si la escritura a Supabase falla, por prueba. */
let writeFails = false;

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => {
    const fail = () => ({ error: writeFails ? { message: 'boom' } : null });
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
      from: () => ({
        upsert: async () => fail(),
        update: () => ({ eq: async () => fail() }),
        delete: () => ({ eq: async () => fail() }),
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
            maybeSingle: async () => ({ data: null, error: null }),
            single: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    };
  },
}));

function makeRole(id: string, title = `Puesto ${id}`): Role {
  return {
    id,
    title,
    topics: [],
    createdAt: Date.now(),
    interviewDuration: 30,
    interviewMode: 'restricted',
  };
}

async function freshStore(initial: Role[]) {
  vi.resetModules();
  const { useAdminStore } = await import('@/store/adminStore');
  useAdminStore.setState({ roles: initial, orgId: 'org-1', error: null });
  return useAdminStore;
}

describe('reversión de escrituras optimistas de puestos', () => {
  beforeEach(() => {
    writeFails = false;
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('addRole', () => {
    it('conserva el puesto cuando la escritura funciona', async () => {
      const store = await freshStore([]);
      await store.getState().addRole(makeRole('r1'));

      expect(store.getState().roles.map((r) => r.id)).toEqual(['r1']);
      expect(store.getState().error).toBeNull();
    });

    it('lo retira y avisa cuando la escritura falla', async () => {
      writeFails = true;
      const store = await freshStore([]);
      await store.getState().addRole(makeRole('r1'));

      expect(store.getState().roles).toEqual([]);
      expect(store.getState().error).toBeTruthy();
    });

    it('DEVUELVE el resultado, para que quien llama no siga construyendo encima', async () => {
      // Devolvía `void`, y eso tenía consecuencias fuera del store: `create-role` lo espera y a
      // continuación publica el enlace, crea un ticket por candidato contra ese id y envía los
      // correos. Con el puesto sin persistir, los candidatos recibían una invitación muerta
      // mientras la pantalla decía «¡Puesto Creado!». La reversión local no basta para eso.
      const store = await freshStore([]);
      await expect(store.getState().addRole(makeRole('ok'))).resolves.toBe(true);

      writeFails = true;
      await expect(store.getState().addRole(makeRole('falla'))).resolves.toBe(false);
    });

    it('la reversión no arrastra otros puestos', async () => {
      // Se revierte ESE puesto, no se restaura el array completo: un `set` con la instantánea
      // anterior descartaría cualquier cambio ocurrido durante la petición.
      writeFails = true;
      const store = await freshStore([makeRole('previo')]);
      await store.getState().addRole(makeRole('nuevo'));

      expect(store.getState().roles.map((r) => r.id)).toEqual(['previo']);
    });
  });

  describe('updateRole', () => {
    it('deja el cambio cuando la escritura funciona', async () => {
      const store = await freshStore([makeRole('r1', 'Antiguo')]);
      await store.getState().updateRole('r1', { title: 'Nuevo' });

      expect(store.getState().roles[0].title).toBe('Nuevo');
      expect(store.getState().error).toBeNull();
    });

    it('restaura el título anterior cuando la escritura falla', async () => {
      writeFails = true;
      const store = await freshStore([makeRole('r1', 'Antiguo')]);
      await store.getState().updateRole('r1', { title: 'Nuevo' });

      expect(store.getState().roles[0].title).toBe('Antiguo');
      expect(store.getState().error).toBeTruthy();
    });

    it('restaura todos los campos, no solo el editado', async () => {
      writeFails = true;
      const store = await freshStore([makeRole('r1', 'Antiguo')]);
      await store
        .getState()
        .updateRole('r1', { title: 'Nuevo', interviewDuration: 90, isPublished: true });

      const role = store.getState().roles[0];
      expect(role.title).toBe('Antiguo');
      expect(role.interviewDuration).toBe(30);
    });
  });

  describe('removeRole', () => {
    it('lo elimina cuando el borrado funciona', async () => {
      const store = await freshStore([makeRole('r1'), makeRole('r2')]);
      await store.getState().removeRole('r1');

      expect(store.getState().roles.map((r) => r.id)).toEqual(['r2']);
      expect(store.getState().error).toBeNull();
    });

    it('lo devuelve y avisa cuando el borrado falla', async () => {
      // Es el peor de los tres: el admin creía haber retirado el puesto y seguía publicado.
      writeFails = true;
      const store = await freshStore([makeRole('r1'), makeRole('r2')]);
      await store.getState().removeRole('r1');

      expect(store.getState().roles.map((r) => r.id)).toContain('r1');
      expect(store.getState().error).toBeTruthy();
    });

    it('lo devuelve a su POSICIÓN, no al principio', async () => {
      // La lista va ordenada por fecha de creación descendente; reinsertar al principio la
      // desordenaría y el admin vería el puesto saltar de sitio.
      writeFails = true;
      const store = await freshStore([makeRole('a'), makeRole('b'), makeRole('c')]);
      await store.getState().removeRole('b');

      expect(store.getState().roles.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('no duplica si el puesto ya volvió por otra vía', async () => {
      writeFails = true;
      const store = await freshStore([makeRole('r1')]);

      const pending = store.getState().removeRole('r1');
      // Otra escritura lo repone mientras el borrado está en vuelo.
      store.setState({ roles: [makeRole('r1')] });
      await pending;

      expect(store.getState().roles.filter((r) => r.id === 'r1')).toHaveLength(1);
    });

    it('borrar un id inexistente no inventa un puesto', async () => {
      writeFails = true;
      const store = await freshStore([makeRole('r1')]);
      await store.getState().removeRole('no-existe');

      expect(store.getState().roles.map((r) => r.id)).toEqual(['r1']);
    });
  });
});
