// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar la ruta.
vi.mock('server-only', () => ({}));

import { createFakeSupabase, type FakeRow } from '../helpers/fake-supabase';

/**
 * Pruebas de autorización de `/api/candidate-results`.
 *
 * La ruta escribe con la SERVICE ROLE KEY, que bypassa RLS: si la ruta no
 * valida, no valida nadie. Aquí se fijan las tres capas que la componen:
 *
 *  1. PRUEBA DE ACCESO. Sin credencial → `401` y cero escrituras. Las tres
 *     credenciales aceptadas son el `ticketToken`, el `publicToken` de la vacante
 *     y la sesión `owner`/`admin` de la organización dueña de la vacante (el
 *     camino de `/admin/pipeline`, que no tiene token de candidato). Una
 *     credencial válida de OTRA vacante u otra organización → `403`.
 *  2. PERTENENCIA DE LA FILA. El `POST` no pisa un `id` de otra entrevista y el
 *     `PATCH` no toca una fila que no sea de la entrevista acreditada.
 *  3. LISTA BLANCA DE COLUMNAS del `PATCH`.
 *
 * El detalle que puede romper el flujo real, y que por eso tiene prueba propia:
 * un ticket YA CONSUMIDO sigue acreditando. El ticket se quema al entrar a la
 * sala, así que TODAS las escrituras del flujo de ticket llegan con
 * `used = true`; exigir `used = false` dejaría a cada candidato sin poder guardar
 * su propia entrevista. Un ticket VENCIDO, en cambio, no acredita.
 *
 * TODAS LAS CREDENCIALES SON FICTICIAS. Ninguna real puede entrar en este
 * archivo: quedaría en el historial de git para siempre.
 */

const ORG_VICTIM = 'org-victima';
const ORG_ATTACKER = 'org-atacante';
const ROLE_VICTIM = 'role-victima';
const ROLE_ATTACKER = 'role-atacante';
const RESULT_VICTIM = 'cand-victima';

/** `interview_tickets.token` del candidato de la vacante víctima. */
const TICKET_VICTIM = 'TICKETVICTIMA1234';
/** Mismo rol, pero ya consumido: el estado normal de las escrituras. */
const TICKET_VICTIM_USED = 'TICKETUSADO123456';
/** Mismo rol, vencido. */
const TICKET_VICTIM_EXPIRED = 'TICKETVENCIDO1234';
/** Ticket legítimo de OTRA vacante: la credencial del atacante. */
const TICKET_ATTACKER = 'TICKETATACANTE123';
const TICKET_UNKNOWN = 'TICKETINEXISTENTE';

/** `roles.public_token` de cada vacante. */
const PUBLIC_TOKEN_VICTIM = 'pub-victima-ficticio';
const PUBLIC_TOKEN_ATTACKER = 'pub-atacante-ficticio';
const PUBLIC_TOKEN_UNKNOWN = 'pub-inexistente';

const OWNER_OF_VICTIM = 'usr-owner-org-victima';
const OWNER_OF_ATTACKER = 'usr-owner-org-atacante';
const MEMBER_OF_VICTIM = 'usr-member-org-victima';

const HOUR_MS = 60 * 60 * 1000;

const supabase = createFakeSupabase();

/** Usuario que devuelve el cliente de sesión. `null` = sin sesión. */
let sessionUser: { id: string } | null = null;

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: sessionUser }, error: null }),
    },
  }),
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabase.client,
}));

import { NextRequest } from 'next/server';

import { POST, PATCH } from '@/app/api/candidate-results/route';

let NOW = 0;

function seed() {
  NOW = Date.now();
  sessionUser = null;

  supabase.reset({
    roles: [
      { id: ROLE_VICTIM, org_id: ORG_VICTIM, public_token: PUBLIC_TOKEN_VICTIM },
      { id: ROLE_ATTACKER, org_id: ORG_ATTACKER, public_token: PUBLIC_TOKEN_ATTACKER },
    ],
    interview_tickets: [
      {
        token: TICKET_VICTIM,
        role_id: ROLE_VICTIM,
        expires_at: NOW + HOUR_MS,
        used: false,
      },
      {
        token: TICKET_VICTIM_USED,
        role_id: ROLE_VICTIM,
        expires_at: NOW + HOUR_MS,
        used: true,
      },
      {
        token: TICKET_VICTIM_EXPIRED,
        role_id: ROLE_VICTIM,
        expires_at: NOW - HOUR_MS,
        used: false,
      },
      {
        token: TICKET_ATTACKER,
        role_id: ROLE_ATTACKER,
        expires_at: NOW + HOUR_MS,
        used: true,
      },
    ],
    candidate_results: [
      {
        id: RESULT_VICTIM,
        org_id: ORG_VICTIM,
        role_id: ROLE_VICTIM,
        candidate_name: 'Candidata Ajena',
        candidate_email: 'ajena@ejemplo-ficticio.test',
        candidate_phone: '+34600000000',
        role_title: 'Backend',
        status: 'completed',
        duration: 1800,
        transcript: [{ role: 'user', content: 'hola', timestamp: 1 }],
        evaluation: { overallScore: 91 },
        source: 'ticket',
        video_url: null,
        date: 1,
      },
    ],
    org_members: [
      { user_id: OWNER_OF_VICTIM, org_id: ORG_VICTIM, role: 'owner' },
      { user_id: OWNER_OF_ATTACKER, org_id: ORG_ATTACKER, role: 'owner' },
      { user_id: MEMBER_OF_VICTIM, org_id: ORG_VICTIM, role: 'member' },
    ],
    user_profiles: [
      { user_id: OWNER_OF_VICTIM, org_id: ORG_VICTIM, role: 'owner' },
      { user_id: OWNER_OF_ATTACKER, org_id: ORG_ATTACKER, role: 'owner' },
      { user_id: MEMBER_OF_VICTIM, org_id: ORG_VICTIM, role: 'member' },
    ],
  });
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/candidate-results', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/candidate-results', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

const resultRows = (): FakeRow[] => supabase.tables.candidate_results;

const victimRow = (): FakeRow => {
  const row = resultRows().find((candidate) => candidate.id === RESULT_VICTIM);
  if (!row) throw new Error('La fila sembrada desapareció');
  return row;
};

/** Cuerpo mínimo de un `POST` legítimo del flujo de ticket. */
function ticketPostBody(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cand-nuevo',
    roleId: ROLE_VICTIM,
    candidateName: 'Candidata Nueva',
    roleTitle: 'Backend',
    ticketToken: TICKET_VICTIM,
    ...overrides,
  };
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/candidate-results — prueba de acceso', () => {
  it('responde 401 sin credencial y no escribe nada', async () => {
    const res = await POST(postRequest({ id: 'cand-inyectado', roleId: ROLE_VICTIM }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(resultRows()).toHaveLength(1);
  });

  it('responde 401 sin credencial antes de leer candidate_results', async () => {
    // El rechazo se decide sin tocar la tabla: no hay ni consulta de pertenencia.
    await POST(postRequest({ id: RESULT_VICTIM, roleId: ROLE_VICTIM }));

    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().status).toBe('completed');
  });

  it('responde 401 con un ticketToken inexistente', async () => {
    const res = await POST(postRequest(ticketPostBody({ ticketToken: TICKET_UNKNOWN })));

    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
    expect(resultRows()).toHaveLength(1);
  });

  it('responde 401 con un ticketToken vencido', async () => {
    // Un token vencido ya no acredita nada, así que es 401 y no 403: la
    // credencial no es válida, no es que valga para otra vacante.
    const res = await POST(postRequest(ticketPostBody({ ticketToken: TICKET_VICTIM_EXPIRED })));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('ACEPTA un ticketToken ya consumido, que es el estado normal', async () => {
    // El ticket se quema al entrar a la sala (`/api/interview/ticket/consume`),
    // así que todas las escrituras del flujo llegan con `used = true`. Exigir
    // `used = false` aquí dejaría a cada candidato sin poder guardar su
    // entrevista.
    const res = await POST(postRequest(ticketPostBody({ ticketToken: TICKET_VICTIM_USED })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_VICTIM });
    expect(resultRows()).toHaveLength(2);
  });

  it('responde 403 con un ticketToken de otra vacante y no escribe nada', async () => {
    const res = await POST(postRequest(ticketPostBody({ ticketToken: TICKET_ATTACKER })));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(supabase.writes).toHaveLength(0);
    expect(resultRows()).toHaveLength(1);
  });

  it('acepta el publicToken de la vacante indicada', async () => {
    const res = await POST(
      postRequest(ticketPostBody({ ticketToken: undefined, publicToken: PUBLIC_TOKEN_VICTIM })),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_VICTIM });
  });

  it('responde 403 con el publicToken de otra vacante', async () => {
    const res = await POST(
      postRequest(ticketPostBody({ ticketToken: undefined, publicToken: PUBLIC_TOKEN_ATTACKER })),
    );

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 401 con un publicToken inexistente', async () => {
    const res = await POST(
      postRequest(ticketPostBody({ ticketToken: undefined, publicToken: PUBLIC_TOKEN_UNKNOWN })),
    );

    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
  });

  it('acepta la sesión de un owner de la organización dueña de la vacante', async () => {
    sessionUser = { id: OWNER_OF_VICTIM };

    const res = await POST(postRequest(ticketPostBody({ ticketToken: undefined })));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_VICTIM });
  });

  it('responde 403 con la sesión de otra organización', async () => {
    sessionUser = { id: OWNER_OF_ATTACKER };

    const res = await POST(postRequest(ticketPostBody({ ticketToken: undefined })));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 403 con la sesión de un miembro sin permiso de la misma organización', async () => {
    sessionUser = { id: MEMBER_OF_VICTIM };

    const res = await POST(postRequest(ticketPostBody({ ticketToken: undefined })));

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
  });

  it('rechaza con 400 presentar las dos credenciales a la vez', async () => {
    const res = await POST(
      postRequest(ticketPostBody({ publicToken: PUBLIC_TOKEN_VICTIM })),
    );

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
  });

  it('rechaza con 400 una credencial vacía en lugar de caer en la sesión', async () => {
    sessionUser = { id: OWNER_OF_VICTIM };

    const res = await POST(postRequest(ticketPostBody({ ticketToken: '' })));

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
  });
});

describe('POST /api/candidate-results — pertenencia de la fila', () => {
  it('crea una fila nueva con 200 y resuelve org_id desde el roleId', async () => {
    const res = await POST(
      postRequest({
        id: 'cand-nuevo',
        roleId: ROLE_ATTACKER,
        candidateName: 'Candidato Nuevo',
        roleTitle: 'Frontend',
        ticketToken: TICKET_ATTACKER,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_ATTACKER });
    expect(resultRows()).toHaveLength(2);
    const created = resultRows().find((row) => row.id === 'cand-nuevo');
    expect(created).toMatchObject({ org_id: ORG_ATTACKER, role_id: ROLE_ATTACKER });
  });

  it('responde 403 y deja la fila intacta al pisar un id de otra organización', async () => {
    // La credencial del atacante es legítima para SU vacante, así que la que
    // rechaza aquí es la comprobación de rol: el `roleId` del cuerpo no es el que
    // acredita el ticket.
    const before = { ...victimRow() };

    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_VICTIM,
        candidateName: 'Atacante',
        roleTitle: 'Frontend',
        status: 'in-progress',
        ticketToken: TICKET_ATTACKER,
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow()).toEqual(before);
    expect(resultRows()).toHaveLength(1);
  });

  it('responde 403 al pisar un id de otra organización con credencial propia', async () => {
    // Credencial válida para la vacante del atacante + `roleId` del atacante,
    // pero el `id` existente es de otra entrevista: lo corta la pertenencia.
    const before = { ...victimRow() };

    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_ATTACKER,
        candidateName: 'Atacante',
        roleTitle: 'Frontend',
        ticketToken: TICKET_ATTACKER,
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow()).toEqual(before);
  });

  it('responde 403 aunque el cuerpo declare el org_id de la víctima', async () => {
    const before = { ...victimRow() };

    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_ATTACKER,
        orgId: ORG_VICTIM,
        candidateName: 'Atacante',
        roleTitle: 'Frontend',
        ticketToken: TICKET_ATTACKER,
      }),
    );

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow()).toEqual(before);
  });

  it('acepta 200 al reescribir un id propio del mismo rol y organización', async () => {
    const res = await POST(
      postRequest({
        id: RESULT_VICTIM,
        roleId: ROLE_VICTIM,
        candidateName: 'Candidata Ajena',
        roleTitle: 'Backend',
        status: 'completed',
        duration: 1900,
        ticketToken: TICKET_VICTIM_USED,
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true, orgId: ORG_VICTIM });
    expect(supabase.writes).toHaveLength(1);
    expect(victimRow()).toMatchObject({
      org_id: ORG_VICTIM,
      role_id: ROLE_VICTIM,
      duration: 1900,
    });
  });

  it('responde 422 y no escribe cuando el roleId no resuelve a ninguna organización', async () => {
    supabase.tables.roles.push({ id: 'role-huerfano', org_id: null, public_token: null });
    supabase.tables.interview_tickets.push({
      token: 'TICKETHUERFANO123',
      role_id: 'role-huerfano',
      expires_at: NOW + HOUR_MS,
      used: false,
    });

    const res = await POST(
      postRequest({
        id: 'cand-sin-rol',
        roleId: 'role-huerfano',
        orgId: ORG_ATTACKER,
        candidateName: 'Sin Rol',
        ticketToken: 'TICKETHUERFANO123',
      }),
    );

    expect(res.status).toBe(422);
    expect(supabase.writes).toHaveLength(0);
    expect(resultRows()).toHaveLength(1);
  });
});

describe('PATCH /api/candidate-results — prueba de acceso', () => {
  const updates = { status: 'completed' };

  it('responde 401 sin credencial y no escribe nada', async () => {
    const res = await PATCH(patchRequest({ id: RESULT_VICTIM, updates }));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().evaluation).toEqual({ overallScore: 91 });
  });

  it('responde 401 sin credencial también con un updates válido y completo', async () => {
    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { status: 'completed', evaluation: { overallScore: 10 } },
      }),
    );

    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().evaluation).toEqual({ overallScore: 91 });
  });

  it('responde 403 con un ticketToken de otra vacante y deja la fila intacta', async () => {
    const before = { ...victimRow() };

    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { status: 'completed', evaluation: { overallScore: 10 } },
        ticketToken: TICKET_ATTACKER,
      }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow()).toEqual(before);
  });

  it('responde 403 con el publicToken de otra vacante y deja la fila intacta', async () => {
    const before = { ...victimRow() };

    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates,
        publicToken: PUBLIC_TOKEN_ATTACKER,
      }),
    );

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow()).toEqual(before);
  });

  it('responde 403 con la sesión de otra organización y deja la fila intacta', async () => {
    sessionUser = { id: OWNER_OF_ATTACKER };
    const before = { ...victimRow() };

    const res = await PATCH(patchRequest({ id: RESULT_VICTIM, updates }));

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow()).toEqual(before);
  });

  it('responde 401 con un ticketToken vencido', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates, ticketToken: TICKET_VICTIM_EXPIRED }),
    );

    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
  });

  it('acepta el ticketToken ya consumido de la propia entrevista', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates, ticketToken: TICKET_VICTIM_USED }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(supabase.writes).toHaveLength(1);
  });

  it('acepta la sesión de un owner de la organización dueña de la fila', async () => {
    sessionUser = { id: OWNER_OF_VICTIM };

    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { status: 'completed', evaluation: { overallScore: 55 } },
      }),
    );

    expect(res.status).toBe(200);
    expect(victimRow().evaluation).toEqual({ overallScore: 55 });
  });

  it('responde 404 cuando la fila no existe, en lugar de un 200 que no escribió', async () => {
    const res = await PATCH(
      patchRequest({ id: 'cand-inexistente', updates, ticketToken: TICKET_VICTIM }),
    );

    expect(res.status).toBe(404);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 403 cuando la fila no tiene rol que acreditar', async () => {
    supabase.tables.candidate_results.push({
      id: 'cand-sin-rol',
      org_id: ORG_VICTIM,
      role_id: null,
      status: 'in-progress',
    });

    const res = await PATCH(
      patchRequest({ id: 'cand-sin-rol', updates, ticketToken: TICKET_VICTIM }),
    );

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 403 cuando el org_id de la fila no es el de su vacante', async () => {
    // Solo puede pasar si la fila quedó desalineada de `roles.org_id`. En ese
    // caso no se escribe: la fila no pertenece a la organización acreditada.
    supabase.tables.candidate_results.push({
      id: 'cand-desalineado',
      org_id: ORG_ATTACKER,
      role_id: ROLE_VICTIM,
      status: 'in-progress',
    });

    const res = await PATCH(
      patchRequest({ id: 'cand-desalineado', updates, ticketToken: TICKET_VICTIM }),
    );

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
  });
});

describe('PATCH /api/candidate-results — lista blanca de columnas', () => {
  /** Todas usan una credencial válida: lo que se prueba es el filtro de columnas. */
  const proof = { ticketToken: TICKET_VICTIM_USED };

  it('rechaza org_id con 400 y no escribe nada (escalada entre organizaciones)', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { org_id: ORG_ATTACKER }, ...proof }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['org_id']);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().org_id).toBe(ORG_VICTIM);
  });

  it('rechaza org_id incluso acompañado de columnas válidas', async () => {
    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { status: 'completed', org_id: ORG_ATTACKER },
        ...proof,
      }),
    );

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().org_id).toBe(ORG_VICTIM);
  });

  it('rechaza role_id con 400 y no escribe nada', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { role_id: ROLE_ATTACKER }, ...proof }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['role_id']);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().role_id).toBe(ROLE_VICTIM);
  });

  it('rechaza id dentro de updates con 400 y no escribe nada', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { id: 'cand-secuestrado' }, ...proof }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['id']);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().id).toBe(RESULT_VICTIM);
  });

  it('rechaza columnas que el flujo del candidato nunca escribe', async () => {
    const res = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { candidate_email: 'atacante@ejemplo-ficticio.test' },
        ...proof,
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.rejectedKeys).toEqual(['candidate_email']);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().candidate_email).toBe('ajena@ejemplo-ficticio.test');
  });

  it('acepta 200 cuando updates solo trae columnas de la lista blanca', async () => {
    const updates = {
      status: 'completed',
      transcript: [{ role: 'assistant', content: 'listo', timestamp: 2 }],
      duration: 42,
      video_url: 'https://ejemplo-ficticio.test/video.webm',
      evaluation: { overallScore: 77 },
    };

    const res = await PATCH(patchRequest({ id: RESULT_VICTIM, updates, ...proof }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(supabase.writes).toHaveLength(1);
    expect(supabase.writes[0]).toMatchObject({ table: 'candidate_results', op: 'update' });
    expect(supabase.writes[0].payload).toEqual(updates);
    expect(victimRow().duration).toBe(42);
  });

  it('rechaza un updates vacío en lugar de emitir un update sin columnas', async () => {
    const res = await PATCH(patchRequest({ id: RESULT_VICTIM, updates: {}, ...proof }));

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
  });

  it('rechaza un status fuera de los del flujo del candidato', async () => {
    const res = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { status: 'hired' }, ...proof }),
    );

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
    expect(victimRow().status).toBe('completed');
  });

  it('rechaza el updates poisoned antes de leer la fila', async () => {
    // La lista blanca es pura: no hace falta ni saber si la fila existe.
    const res = await PATCH(
      patchRequest({ id: 'cand-inexistente', updates: { org_id: ORG_ATTACKER }, ...proof }),
    );

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
  });
});

/**
 * Los tres caminos legítimos, de principio a fin.
 *
 * Es la condición de aceptación de todo el endurecimiento: si alguno de estos
 * deja de funcionar, el candidato no puede guardar su entrevista o el panel no
 * puede reintentar una evaluación, y eso es peor que el agujero que se cierra.
 */
describe('/api/candidate-results — los tres flujos legítimos completos', () => {
  it('flujo de ticket: crear en progreso, sincronizar y completar con el ticket ya consumido', async () => {
    // 1. La sala arranca y crea la fila (el ticket todavía está disponible en el
    //    instante del primer `POST`, pero se quema justo al entrar).
    const created = await POST(
      postRequest({
        id: 'cand-ticket',
        roleId: ROLE_VICTIM,
        candidateName: 'Candidata Ficticia',
        roleTitle: 'Backend',
        status: 'in-progress',
        source: 'ticket',
        ticketToken: TICKET_VICTIM,
      }),
    );
    expect(created.status).toBe(200);

    // 2. El ticket queda consumido, como hace la página al entrar a la sala.
    const ticket = supabase.tables.interview_tickets.find(
      (row) => row.token === TICKET_VICTIM,
    );
    if (!ticket) throw new Error('El ticket sembrado desapareció');
    ticket.used = true;

    // 3. Sincronización de la transcripción durante la entrevista.
    const synced = await PATCH(
      patchRequest({
        id: 'cand-ticket',
        updates: {
          transcript: [{ role: 'user', content: 'respuesta', timestamp: 3 }],
          duration: 120,
        },
        ticketToken: TICKET_VICTIM,
      }),
    );
    expect(synced.status).toBe(200);

    // 4. Cierre con la evaluación.
    const completed = await PATCH(
      patchRequest({
        id: 'cand-ticket',
        updates: {
          status: 'completed',
          duration: 1500,
          video_url: 'https://ejemplo-ficticio.test/v.webm',
          evaluation: { overallScore: 82 },
        },
        ticketToken: TICKET_VICTIM,
      }),
    );
    expect(completed.status).toBe(200);

    const row = resultRows().find((entry) => entry.id === 'cand-ticket');
    expect(row).toMatchObject({
      org_id: ORG_VICTIM,
      role_id: ROLE_VICTIM,
      status: 'completed',
      duration: 1500,
      evaluation: { overallScore: 82 },
      source: 'ticket',
    });
  });

  it('flujo de enlace público: sobre la fila que creó /api/public-interview', async () => {
    // `/api/public-interview` ya insertó la fila con `service_role` al
    // registrarse el candidato; el flujo sigue con el `publicToken`.
    supabase.tables.candidate_results.push({
      id: 'cand-publico',
      org_id: ORG_VICTIM,
      role_id: ROLE_VICTIM,
      candidate_name: 'Candidato Público',
      role_title: 'Backend',
      status: 'in-progress',
      source: 'public_link',
      transcript: [],
      duration: 0,
    });

    const upserted = await POST(
      postRequest({
        id: 'cand-publico',
        roleId: ROLE_VICTIM,
        candidateName: 'Candidato Público',
        roleTitle: 'Backend',
        status: 'in-progress',
        source: 'public_link',
        publicToken: PUBLIC_TOKEN_VICTIM,
      }),
    );
    expect(upserted.status).toBe(200);

    const completed = await PATCH(
      patchRequest({
        id: 'cand-publico',
        updates: {
          status: 'completed',
          duration: 900,
          evaluation: { overallScore: 64 },
        },
        publicToken: PUBLIC_TOKEN_VICTIM,
      }),
    );
    expect(completed.status).toBe(200);

    expect(resultRows().find((entry) => entry.id === 'cand-publico')).toMatchObject({
      org_id: ORG_VICTIM,
      status: 'completed',
      evaluation: { overallScore: 64 },
      source: 'public_link',
    });
  });

  it('flujo del panel: reintento manual de la evaluación desde /admin/pipeline', async () => {
    // `/admin/pipeline` llama a `updateCandidate` sin token de candidato: su
    // credencial es la sesión de la organización dueña de la vacante.
    sessionUser = { id: OWNER_OF_VICTIM };

    const pending = await PATCH(
      patchRequest({ id: RESULT_VICTIM, updates: { status: 'pending-evaluation' } }),
    );
    expect(pending.status).toBe(200);
    expect(victimRow().status).toBe('pending-evaluation');

    const completed = await PATCH(
      patchRequest({
        id: RESULT_VICTIM,
        updates: { status: 'completed', evaluation: { overallScore: 73 } },
      }),
    );
    expect(completed.status).toBe(200);
    expect(victimRow()).toMatchObject({
      status: 'completed',
      evaluation: { overallScore: 73 },
    });
  });
});
