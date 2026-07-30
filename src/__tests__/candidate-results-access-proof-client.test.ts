import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  accessProofRequestFields,
  parseCandidateResultAccessProof,
} from '@/lib/candidate-results/access-proof-contracts';
import { useAdminStore } from '@/store/adminStore';
import { useInterviewStore } from '@/store/interviewStore';

/**
 * Propagación de la PRUEBA DE ACCESO desde el navegador.
 *
 * `/api/candidate-results` ya no acepta escrituras sin credencial, así que si el
 * cliente no la envía el flujo del candidato se rompe entero: transcripción,
 * evaluación y estado final se quedan sin guardar. Estas pruebas fijan las tres
 * cosas que tienen que cumplirse para que eso no pase:
 *
 *  1. La credencial se lee del store de la entrevista EN EL MOMENTO de cada
 *     petición, no al construir el store.
 *  2. `retrySyncQueue` la lleva también al reintentar, que es el camino por el
 *     que se recuperan las escrituras que fallaron.
 *  3. El camino del panel no manda ninguna clave de credencial: su credencial es
 *     la sesión, que viaja en las cookies de la petición al mismo origen.
 */

const SYNC_QUEUE_KEY = 'reclutify_sync_queue';

const TICKET_TOKEN = 'TICKETFICTICIO123';
const PUBLIC_TOKEN = 'pub-ficticio-de-prueba';

interface CapturedRequest {
  method: string;
  body: Record<string, unknown>;
}

const captured: CapturedRequest[] = [];

function okResponse(): Response {
  return new Response(JSON.stringify({ ok: true, orgId: 'org-ficticia' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  captured.length = 0;
  localStorage.clear();
  useInterviewStore.getState().reset();

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.push({
        method: init?.method ?? 'GET',
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      });
      return okResponse();
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('accessProofRequestFields', () => {
  it('traduce cada credencial a su clave del cuerpo', () => {
    expect(accessProofRequestFields({ kind: 'ticket', token: TICKET_TOKEN })).toEqual({
      ticketToken: TICKET_TOKEN,
    });
    expect(accessProofRequestFields({ kind: 'public-link', token: PUBLIC_TOKEN })).toEqual({
      publicToken: PUBLIC_TOKEN,
    });
  });

  it('sin credencial no añade ninguna clave: es el camino de la sesión', () => {
    expect(accessProofRequestFields(null)).toEqual({});
  });

  it('lo que produce el cliente es lo que el servidor sabe leer', () => {
    // Las dos mitades del contrato viven en el mismo módulo a propósito: si una
    // cambia el nombre del campo, esta prueba falla.
    const proof = { kind: 'ticket', token: TICKET_TOKEN } as const;
    const parsed = parseCandidateResultAccessProof({
      id: 'cand-1',
      ...accessProofRequestFields(proof),
    });

    expect(parsed).toEqual({ ok: true, proof });
  });
});

describe('adminStore — propagación de la credencial', () => {
  it('updateCandidate manda el ticketToken del store de la entrevista', async () => {
    useInterviewStore.getState().setAccessProof({ kind: 'ticket', token: TICKET_TOKEN });

    await useAdminStore.getState().updateCandidate('cand-1', { status: 'completed' });

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('PATCH');
    expect(captured[0].body).toEqual({
      id: 'cand-1',
      updates: { status: 'completed' },
      ticketToken: TICKET_TOKEN,
    });
  });

  it('addCandidate manda el publicToken en el flujo de enlace público', async () => {
    useInterviewStore.getState().setAccessProof({ kind: 'public-link', token: PUBLIC_TOKEN });

    await useAdminStore.getState().addCandidate({
      id: 'cand-publico',
      candidate: { name: 'Candidato Público', email: 'publico@ejemplo-ficticio.test', phone: '' },
      roleId: 'role-ficticio',
      roleTitle: 'Backend',
      date: 1,
      status: 'in-progress',
      transcript: [],
      source: 'public_link',
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe('POST');
    expect(captured[0].body).toMatchObject({
      id: 'cand-publico',
      roleId: 'role-ficticio',
      publicToken: PUBLIC_TOKEN,
    });
    expect(captured[0].body.ticketToken).toBeUndefined();
  });

  it('el camino del panel no manda ninguna clave de credencial', async () => {
    // `/admin/pipeline` no tiene token de candidato: su credencial es la sesión,
    // que `fetch` envía en las cookies al ser una petición al mismo origen.
    await useAdminStore.getState().updateCandidate('cand-1', { status: 'completed' });

    expect(captured).toHaveLength(1);
    expect(captured[0].body).toEqual({
      id: 'cand-1',
      updates: { status: 'completed' },
    });
  });

  it('retrySyncQueue también lleva la credencial al reintentar', async () => {
    localStorage.setItem(
      SYNC_QUEUE_KEY,
      JSON.stringify([
        {
          id: 'candidate_update-cand-2-1',
          kind: 'candidate_update',
          candidateId: 'cand-2',
          payload: { status: 'completed', duration: 60 },
          createdAt: Date.now(),
          attempts: 1,
        },
      ]),
    );
    useInterviewStore.getState().setAccessProof({ kind: 'ticket', token: TICKET_TOKEN });

    await useAdminStore.getState().retrySyncQueue();

    expect(captured).toHaveLength(1);
    expect(captured[0].body).toEqual({
      id: 'cand-2',
      updates: { status: 'completed', duration: 60 },
      ticketToken: TICKET_TOKEN,
    });
    // La cola queda vacía: el reintento se aceptó.
    expect(useAdminStore.getState().pendingSyncCount).toBe(0);
  });
});
