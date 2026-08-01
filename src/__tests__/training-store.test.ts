import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Cobertura de `trainingStore`.
 *
 * POR QUÉ ESTE ARCHIVO
 * --------------------
 * A diferencia de `adminStore` y `ticketStore`, este store no usa Supabase directamente:
 * todas sus acciones son `fetch()` contra rutas de `/api/training/*`. Así que aquí se mockea
 * `fetch` global, no el cliente de Supabase.
 *
 * El caso de reversión real de este store es `sendGeneralMessage`/`sendModuleMessage`: el
 * mensaje del usuario se añade de forma optimista al historial, y si la petición falla, hay
 * que devolver el historial a como estaba antes de ese mensaje — no dejarlo a medias con un
 * mensaje que nunca llegó al servidor y sin la respuesta del tutor.
 *
 * `sendGeneralMessage` ya tenía un bug documentado y corregido en 2.30 del reporte (el
 * respaldo de éxito con historial vacío usaba una instantánea vieja). Estos tests cubren el
 * camino de ERROR de red, que es distinto y no estaba probado: ahí sí se debe volver
 * exactamente al backup.
 */

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

async function freshStore() {
  vi.resetModules();
  const { useTrainingStore } = await import('@/store/trainingStore');
  useTrainingStore.getState().reset();
  return useTrainingStore;
}

describe('trainingStore', () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('sendGeneralMessage — reversión ante fallo de red', () => {
    it('deja el mensaje del usuario y la respuesta del tutor cuando la petición funciona', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ message: 'Respuesta del tutor', history: [] }),
      );

      const store = await freshStore();
      await store.getState().sendGeneralMessage('Hola');

      const messages = store.getState().generalMessages;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content).toBe('Hola');
      expect(messages[1].role).toBe('assistant');
      expect(messages[1].content).toBe('Respuesta del tutor');
    });

    it('REVIERTE al historial anterior cuando la respuesta no es ok', async () => {
      // Antes de mandar nada, el historial tiene un mensaje previo del tutor. Se comprueba que
      // tras el fallo, el historial vuelve exactamente a ese estado — sin el mensaje nuevo del
      // usuario colgado sin respuesta.
      const store = await freshStore();
      store.setState({
        generalMessages: [{ role: 'assistant', content: 'Saludo inicial', timestamp: 1 }],
      });

      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'caído' }, false, 500));

      await expect(store.getState().sendGeneralMessage('Pregunta que falla')).rejects.toThrow();

      expect(store.getState().generalMessages).toEqual([
        { role: 'assistant', content: 'Saludo inicial', timestamp: 1 },
      ]);
    });

    it('revierte también ante una excepción de red (fetch rechaza)', async () => {
      const store = await freshStore();
      store.setState({
        generalMessages: [{ role: 'assistant', content: 'Saludo', timestamp: 1 }],
      });

      fetchMock.mockRejectedValueOnce(new Error('sin conexión'));

      await expect(store.getState().sendGeneralMessage('Otra pregunta')).rejects.toThrow();

      expect(store.getState().generalMessages).toEqual([
        { role: 'assistant', content: 'Saludo', timestamp: 1 },
      ]);
    });

    it('aiSpeaking vuelve a false incluso cuando la petición falla', async () => {
      // Es el mismo defecto que un `finally` ausente ya corregido en otros stores esta ronda:
      // sin él, el indicador de "el tutor está escribiendo" se queda encendido para siempre.
      const store = await freshStore();
      fetchMock.mockRejectedValueOnce(new Error('sin conexión'));

      await expect(store.getState().sendGeneralMessage('Hola')).rejects.toThrow();

      expect(store.getState().aiSpeaking).toBe(false);
    });

    it('reporta el error en el store para que la interfaz lo muestre', async () => {
      const store = await freshStore();
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Tutor caído' }, false, 503));

      await expect(store.getState().sendGeneralMessage('Hola')).rejects.toThrow('Tutor caído');

      expect(store.getState().error).toBe('Tutor caído');
    });
  });

  describe('sendModuleMessage — reversión por módulo', () => {
    it('revierte solo el historial del módulo que falló, no otros módulos', async () => {
      const store = await freshStore();
      store.setState({
        moduleMessages: {
          'mod-1': [{ role: 'assistant', content: 'Bienvenida al módulo 1', timestamp: 1 }],
          'mod-2': [{ role: 'assistant', content: 'Bienvenida al módulo 2', timestamp: 2 }],
        },
      });

      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'caído' }, false, 500));

      await expect(
        store.getState().sendModuleMessage('mod-1', 'Pregunta que falla'),
      ).rejects.toThrow();

      const messages = store.getState().moduleMessages;
      expect(messages['mod-1']).toEqual([
        { role: 'assistant', content: 'Bienvenida al módulo 1', timestamp: 1 },
      ]);
      // El módulo 2 nunca se tocó: la reversión no debe arrastrarlo.
      expect(messages['mod-2']).toEqual([
        { role: 'assistant', content: 'Bienvenida al módulo 2', timestamp: 2 },
      ]);
    });

    it('con éxito, conserva el historial que devuelve el servidor', async () => {
      const store = await freshStore();
      const serverHistory = [
        { role: 'user' as const, content: 'Pregunta', timestamp: 1 },
        { role: 'assistant' as const, content: 'Respuesta', timestamp: 2 },
      ];
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ message: 'Respuesta', history: serverHistory, evaluationReady: true }),
      );

      await store.getState().sendModuleMessage('mod-1', 'Pregunta');

      expect(store.getState().moduleMessages['mod-1']).toEqual(serverHistory);
      expect(store.getState().moduleEvaluationReady['mod-1']).toBe(true);
    });
  });

  describe('completeModuleWithoutEvaluation', () => {
    it('devuelve true y refresca la sesión cuando el servidor confirma', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ success: true }))
        // `initializeFromSession` que se dispara después.
        .mockResolvedValueOnce(
          jsonResponse({
            employee: { id: 'e1', org_id: 'org-1', program_id: 'p1', email: 'a@b.com', name: 'A' },
            program: null,
            modules: [],
            progress: [],
          }),
        );

      const store = await freshStore();
      const ok = await store.getState().completeModuleWithoutEvaluation('mod-1');

      expect(ok).toBe(true);
      expect(store.getState().loading).toBe(false);
    });

    it('devuelve false y reporta el error sin lanzar, a diferencia de sendGeneralMessage', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'No se pudo completar' }, false, 500));

      const store = await freshStore();
      const ok = await store.getState().completeModuleWithoutEvaluation('mod-1');

      expect(ok).toBe(false);
      expect(store.getState().error).toBe('No se pudo completar');
      expect(store.getState().loading).toBe(false);
    });
  });

  describe('incrementTimeSpent', () => {
    it('actualiza solo el progreso del módulo indicado', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ timeSpent: 15 }));

      const store = await freshStore();
      store.setState({
        progress: [
          { id: 'p1', employeeId: 'e1', moduleId: 'mod-1', status: 'in_progress', timeSpent: 5, createdAt: '' },
          { id: 'p2', employeeId: 'e1', moduleId: 'mod-2', status: 'in_progress', timeSpent: 5, createdAt: '' },
        ],
      });

      await store.getState().incrementTimeSpent('mod-1', 10);

      const progress = store.getState().progress;
      expect(progress.find((p) => p.moduleId === 'mod-1')?.timeSpent).toBe(15);
      expect(progress.find((p) => p.moduleId === 'mod-2')?.timeSpent).toBe(5);
    });

    it('lanza si el servidor devuelve un timeSpent con forma inválida', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ timeSpent: 'no-es-un-numero' }));

      const store = await freshStore();
      await expect(store.getState().incrementTimeSpent('mod-1', 10)).rejects.toThrow();
    });
  });

  describe('reset', () => {
    it('vuelve al estado inicial completo', async () => {
      const store = await freshStore();
      store.setState({
        employee: { id: 'e1' } as never,
        phase: 'module',
        currentModuleId: 'mod-1',
        generalMessages: [{ role: 'user', content: 'x', timestamp: 1 }],
        error: 'algo',
      });

      store.getState().reset();

      expect(store.getState().employee).toBeNull();
      expect(store.getState().phase).toBe('welcome');
      expect(store.getState().currentModuleId).toBeNull();
      expect(store.getState().generalMessages).toEqual([]);
      expect(store.getState().error).toBeNull();
    });
  });
});
