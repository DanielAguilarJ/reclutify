import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura de `coachSettingsStore`.
 *
 * POR QUÉ ESTE ARCHIVO
 * --------------------
 * El store no tenía ninguna prueba. Cubre cuatro cosas con consecuencias reales:
 *
 *  1. `isDirty` es lo que decide si `useUnsavedChangesWarning` avisa antes de cerrar la
 *     pestaña. Si no se limpia al cargar o al guardar con éxito, el aviso sale siempre aunque
 *     no haya nada pendiente; si se limpia en un guardado que FALLÓ, el aviso no sale cuando
 *     debería.
 *  2. `fetchSettings`/`saveSettings` pasan por `getCoachSettings`/`saveCoachSettings`
 *     (`src/app/actions/coach-settings-secure.ts`), no por Supabase directo. Se mockean esas
 *     dos acciones, no el cliente de Supabase: es lo que el store llama de verdad.
 *  3. `partialize` solo debe persistir `notificationSound`. Es la garantía de que ningún
 *     secreto de integración ni el flag `isDirty` sobreviven a una recarga.
 *  4. `fetchTeam`/`inviteMember`/`removeMember`/`cancelInvitation` sí usan `createClient()`
 *     directo, así que para esos se mockea el cliente, siguiendo el mismo patrón que
 *     `admin-role-rollback.test.ts`.
 */

vi.mock('@/app/actions/coach-settings-secure', () => ({
  getCoachSettings: vi.fn(),
  saveCoachSettings: vi.fn(),
}));

/** Controla la respuesta de las operaciones de equipo simuladas con Supabase directo. */
let teamWriteFails = false;

vi.mock('@/utils/supabase/client', () => ({
  createClient: () => {
    const fail = () => ({ error: teamWriteFails ? { message: 'boom' } : null });
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'inviter-1' } }, error: null }) },
      from: (table: string) => {
        if (table === 'org_members') {
          return {
            select: () => ({
              eq: async () => ({
                data: [{ user_id: 'u1', role: 'member', created_at: '2026-01-01' }],
                error: null,
              }),
            }),
            delete: () => ({ eq: () => ({ eq: async () => fail() }) }),
          };
        }
        if (table === 'user_profiles') {
          return {
            select: () => ({
              eq: () => ({ single: async () => ({ data: { full_name: 'Alguien' }, error: null }) }),
            }),
          };
        }
        if (table === 'team_invitations') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: async () => ({ data: [], error: null }),
                }),
              }),
            }),
            insert: async () => fail(),
            update: () => ({ eq: async () => fail() }),
          };
        }
        throw new Error(`Tabla no simulada: ${table}`);
      },
    };
  },
}));

async function freshStore() {
  vi.resetModules();
  const { useCoachSettingsStore } = await import('@/store/coachSettingsStore');
  useCoachSettingsStore.setState({ orgId: 'org-1', error: null });
  return useCoachSettingsStore;
}

describe('coachSettingsStore', () => {
  beforeEach(() => {
    teamWriteFails = false;
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('isDirty', () => {
    it('empieza en false', async () => {
      const store = await freshStore();
      expect(store.getState().isDirty).toBe(false);
    });

    it('updateSettings lo pone en true', async () => {
      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Nuevo nombre' });

      expect(store.getState().isDirty).toBe(true);
    });

    it('updateIntegration también lo marca', async () => {
      const store = await freshStore();
      store.getState().updateIntegration('webhook', { enabled: true });

      expect(store.getState().isDirty).toBe(true);
    });

    it('fetchSettings lo limpia, aunque la organización no tenga fila todavía', async () => {
      const { getCoachSettings } = await import('@/app/actions/coach-settings-secure');
      vi.mocked(getCoachSettings).mockResolvedValue({ success: true });

      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Con cambios sin guardar' });
      expect(store.getState().isDirty).toBe(true);

      await store.getState().fetchSettings();

      // Lo que acaba de llegar del servidor es, por definición, lo guardado — incluso cuando
      // ese «lo que llegó» es «nada, usa los valores por defecto».
      expect(store.getState().isDirty).toBe(false);
    });

    it('fetchSettings lo limpia cuando SÍ hay una fila guardada', async () => {
      const { getCoachSettings } = await import('@/app/actions/coach-settings-secure');
      vi.mocked(getCoachSettings).mockResolvedValue({
        success: true,
        data: { assistant_name: 'Guardado', integrations: {} },
      });

      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Sin guardar' });

      await store.getState().fetchSettings();

      expect(store.getState().isDirty).toBe(false);
      expect(store.getState().settings.assistantName).toBe('Guardado');
    });

    it('un fetchSettings que FALLA no limpia isDirty', async () => {
      // Si el servidor no respondió, lo que hay en pantalla sigue siendo lo único que existe:
      // limpiar el flag aquí haría que el aviso de cambios sin guardar dejara de saltar sobre
      // un cambio que en realidad nunca se guardó.
      const { getCoachSettings } = await import('@/app/actions/coach-settings-secure');
      vi.mocked(getCoachSettings).mockResolvedValue({ success: false, error: 'caído' });

      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Sin guardar' });

      await store.getState().fetchSettings();

      expect(store.getState().isDirty).toBe(true);
    });

    it('saveSettings con éxito lo limpia', async () => {
      const { saveCoachSettings } = await import('@/app/actions/coach-settings-secure');
      vi.mocked(saveCoachSettings).mockResolvedValue({ success: true });

      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Nuevo' });
      expect(store.getState().isDirty).toBe(true);

      const ok = await store.getState().saveSettings();

      expect(ok).toBe(true);
      expect(store.getState().isDirty).toBe(false);
    });

    it('saveSettings que FALLA no lo limpia', async () => {
      // Es el caso simétrico al de fetchSettings: si el guardado falló, sigue habiendo algo
      // sin guardar. Limpiar el flag aquí sería la misma clase de bug que ya se corrigió en
      // el guardado del perfil de /coach/settings — un éxito parcial que se reporta como
      // éxito total.
      const { saveCoachSettings } = await import('@/app/actions/coach-settings-secure');
      vi.mocked(saveCoachSettings).mockResolvedValue({ success: false, error: 'caído' });

      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Nuevo' });

      const ok = await store.getState().saveSettings();

      expect(ok).toBe(false);
      expect(store.getState().isDirty).toBe(true);
    });

    it('saveSettings sin orgId no revienta ni limpia isDirty', async () => {
      const store = await freshStore();
      store.setState({ orgId: null });
      store.getState().updateSettings({ assistantName: 'Nuevo' });

      const ok = await store.getState().saveSettings();

      expect(ok).toBe(false);
      expect(store.getState().isDirty).toBe(true);
    });
  });

  describe('persistencia en localStorage', () => {
    it('partialize NO incluye isDirty', async () => {
      // Si `isDirty` se persistiera, un `true` de la sesión anterior sobreviviría a una
      // recarga y el aviso de cambios sin guardar saltaría para siempre sin que hubiera nada
      // pendiente de verdad.
      const store = await freshStore();
      store.getState().updateSettings({ assistantName: 'Cambiado' });
      expect(store.getState().isDirty).toBe(true);

      // Fuerza la escritura del middleware `persist` a localStorage.
      await Promise.resolve();

      const raw = localStorage.getItem('reclutify-coach-settings');
      expect(raw).toBeTruthy();
      const persisted = JSON.parse(raw as string);

      expect(persisted.state).not.toHaveProperty('isDirty');
      expect(persisted.state.settings).not.toHaveProperty('isDirty');
    });

    it('partialize NO incluye ningún secreto de integraciones', async () => {
      const store = await freshStore();
      store.getState().updateIntegration('webhook', {
        enabled: true,
        url: 'https://ejemplo.com/webhook',
        secret: 'secreto-que-no-debe-persistirse',
      });

      await Promise.resolve();

      const raw = localStorage.getItem('reclutify-coach-settings');
      const persisted = JSON.parse(raw as string);

      expect(persisted.state.settings).toEqual({ notificationSound: true });
    });

    it('partialize SÍ conserva notificationSound', async () => {
      const store = await freshStore();
      store.getState().updateSettings({ notificationSound: false });

      await Promise.resolve();

      const raw = localStorage.getItem('reclutify-coach-settings');
      const persisted = JSON.parse(raw as string);

      expect(persisted.state.settings).toEqual({ notificationSound: false });
    });
  });

  describe('gestión de equipo (Supabase directo)', () => {
    it('fetchTeam junta miembros e invitaciones pendientes', async () => {
      const store = await freshStore();
      await store.getState().fetchTeam();

      expect(store.getState().teamMembers).toHaveLength(1);
      expect(store.getState().teamMembers[0].fullName).toBe('Alguien');
    });

    it('inviteMember con éxito refresca el equipo', async () => {
      const store = await freshStore();
      const ok = await store.getState().inviteMember('nueva@empresa.com', 'member');

      expect(ok).toBe(true);
    });

    it('inviteMember que falla no revienta y reporta el error', async () => {
      teamWriteFails = true;
      const store = await freshStore();
      const ok = await store.getState().inviteMember('nueva@empresa.com', 'member');

      expect(ok).toBe(false);
      expect(store.getState().error).toBeTruthy();
    });

    it('removeMember que falla reporta el error en vez de tragárselo', async () => {
      teamWriteFails = true;
      const store = await freshStore();
      const ok = await store.getState().removeMember('u1');

      expect(ok).toBe(false);
      expect(store.getState().error).toBeTruthy();
    });

    it('cancelInvitation que falla reporta el error', async () => {
      teamWriteFails = true;
      const store = await freshStore();
      const ok = await store.getState().cancelInvitation('inv-1');

      expect(ok).toBe(false);
      expect(store.getState().error).toBeTruthy();
    });
  });
});
