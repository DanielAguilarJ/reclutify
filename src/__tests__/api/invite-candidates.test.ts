// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar la ruta.
vi.mock('server-only', () => ({}));

import { createFakeSupabase } from '../helpers/fake-supabase';

/**
 * Pruebas de autorización y de tope de tamaño de `/api/invite-candidates`.
 *
 * La ruta crea tickets de entrevista e inserta en `candidate_invites` con la
 * clave de servicio, que bypassa RLS: si la ruta no autoriza, no autoriza nadie.
 * Antes ni siquiera lo intentaba — el `return` del rechazo estaba comentado y la
 * condición empezaba por `secret &&`, así que omitir la cabecera la saltaba por
 * completo.
 *
 * El cierre no es un secreto compartido —no hay ninguna integración externa que
 * lo use— sino sesión de Supabase más pertenencia a la organización dueña de la
 * vacante. Lo que se fija aquí:
 *
 *  - sin sesión → 401 y CERO escrituras;
 *  - con sesión de otra organización → 403 y cero escrituras;
 *  - con sesión de la organización dueña → 200, ticket y espejo creados;
 *  - con sesión de la organización pero con un rol que no puede invitar → 403;
 *  - `roleId` sin organización → 422 y cero escrituras;
 *  - array por encima del tope → 400 y cero escrituras;
 *  - cuerpo inválido → 400 y cero escrituras.
 *
 * Ninguna comprobación depende de una cabecera, así que no hay forma de saltarse
 * una omitiéndola.
 */

const ROLE_ID = 'role-victima';
const ORG_ID = 'org-victima';
const HUERFANO_ROLE_ID = 'role-sin-organizacion';

const OWNER_USER_ID = 'usr-owner-de-la-org';
const OTHER_ORG_USER_ID = 'usr-de-otra-org';
const MEMBER_USER_ID = 'usr-miembro-sin-permiso';

const supabase = createFakeSupabase();

/** Usuario que devuelve el cliente de sesión. `null` = sin sesión. */
let sessionUser: { id: string } | null = null;

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: sessionUser },
        error: null,
      }),
    },
  }),
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabase.client,
}));

import { POST } from '@/app/api/invite-candidates/route';
import { MAX_INVITE_CANDIDATES } from '@/lib/invites/contracts';

function request(body: unknown): Request {
  return new Request('http://localhost/api/invite-candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  roleId: ROLE_ID,
  roleTitle: 'Backend',
  candidates: [{ email: 'candidata@ejemplo-ficticio.test', name: 'Candidata' }],
  language: 'es',
};

let originalAppUrl: string | undefined;

beforeEach(() => {
  originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo-ficticio.test';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});

  sessionUser = { id: OWNER_USER_ID };

  supabase.reset({
    roles: [
      { id: ROLE_ID, org_id: ORG_ID },
      // Vacante heredada sin organización: no hay pertenencia que comprobar.
      { id: HUERFANO_ROLE_ID, org_id: null },
    ],
    org_members: [
      { user_id: OWNER_USER_ID, org_id: ORG_ID, role: 'owner' },
      { user_id: OTHER_ORG_USER_ID, org_id: 'org-ajena', role: 'owner' },
      { user_id: MEMBER_USER_ID, org_id: ORG_ID, role: 'member' },
    ],
    user_profiles: [
      { user_id: OWNER_USER_ID, org_id: ORG_ID, role: 'owner' },
      { user_id: OTHER_ORG_USER_ID, org_id: 'org-ajena', role: 'owner' },
      { user_id: MEMBER_USER_ID, org_id: ORG_ID, role: 'member' },
    ],
  });
});

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  vi.restoreAllMocks();
});

describe('POST /api/invite-candidates — autorización', () => {
  it('responde 401 sin sesión y no escribe nada', async () => {
    sessionUser = null;

    const res = await POST(request(validBody));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(supabase.tables.interview_tickets ?? []).toHaveLength(0);
    expect(supabase.tables.candidate_invites ?? []).toHaveLength(0);
  });

  it('responde 401 sin sesión antes de mirar el cuerpo', async () => {
    // El rechazo no depende del payload: la sesión se exige primero, así que un
    // cuerpo inválido de un anónimo sigue siendo 401 y no 400.
    sessionUser = null;

    const res = await POST(request({ roleId: '' }));

    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 403 con la sesión de otra organización y no escribe nada', async () => {
    sessionUser = { id: OTHER_ORG_USER_ID };

    const res = await POST(request(validBody));

    expect(res.status).toBe(403);
    // Mensaje genérico: no se filtra de qué organización es la vacante.
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' });
    expect(supabase.writes).toHaveLength(0);
    expect(supabase.tables.interview_tickets ?? []).toHaveLength(0);
    expect(supabase.tables.candidate_invites ?? []).toHaveLength(0);
  });

  it('responde 403 a un miembro de la organización sin rol para invitar', async () => {
    sessionUser = { id: MEMBER_USER_ID };

    const res = await POST(request(validBody));

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 422 cuando el roleId no resuelve a ninguna organización', async () => {
    const res = await POST(request({ ...validBody, roleId: HUERFANO_ROLE_ID }));

    expect(res.status).toBe(422);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 422 cuando el roleId no existe', async () => {
    const res = await POST(request({ ...validBody, roleId: 'role-inexistente' }));

    expect(res.status).toBe(422);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 200 con la sesión de la organización dueña y crea el ticket y su espejo', async () => {
    const res = await POST(request(validBody));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.results).toHaveLength(1);

    const [result] = body.results;
    expect(result.email).toBe('candidata@ejemplo-ficticio.test');
    expect(result.candidateId).toBe('candidata@ejemplo-ficticio.test');
    expect(result.inserted).toBe(true);
    expect(result.interviewLink).toBe(
      `https://ejemplo-ficticio.test/interview/t/${result.token}`,
    );

    expect(supabase.writes.map((write) => write.table)).toEqual([
      'interview_tickets',
      'candidate_invites',
    ]);

    const ticket = supabase.tables.interview_tickets[0];
    expect(ticket).toMatchObject({
      token: result.token,
      role_id: ROLE_ID,
      // El org_id se resuelve en el servidor desde el roleId.
      org_id: ORG_ID,
      candidate_name: 'Candidata',
      language: 'es',
      used: false,
    });
    expect(Number(ticket.expires_at)).toBeGreaterThan(Number(ticket.created_at));

    expect(supabase.tables.candidate_invites[0]).toMatchObject({
      id: 'candidata@ejemplo-ficticio.test',
      role_id: ROLE_ID,
      role_title: 'Backend',
      status: 'pending',
      interview_link: result.interviewLink,
    });
  });

  it('acepta al dueño cuya pertenencia solo consta en user_profiles', async () => {
    // El insert de `org_members` del onboarding es de mejor esfuerzo: hay
    // cuentas de empresa cuya única señal de organización es el perfil. Exigir
    // la tabla multi-organización dejaría a esas cuentas sin poder invitar.
    supabase.tables.org_members = [];

    const res = await POST(request(validBody));

    expect(res.status).toBe(200);
    expect(supabase.tables.interview_tickets).toHaveLength(1);
  });

  it('acepta al dueño cuya pertenencia solo consta en org_members', async () => {
    supabase.tables.user_profiles = [];

    const res = await POST(request(validBody));

    expect(res.status).toBe(200);
    expect(supabase.tables.interview_tickets).toHaveLength(1);
  });

  it('responde 403 a un usuario con sesión sin ninguna pertenencia registrada', async () => {
    sessionUser = { id: 'usr-sin-organizacion' };

    const res = await POST(request(validBody));

    expect(res.status).toBe(403);
    expect(supabase.writes).toHaveLength(0);
  });
});

describe('POST /api/invite-candidates — validación del cuerpo', () => {
  it(`responde 400 y no escribe con más de ${MAX_INVITE_CANDIDATES} candidatos`, async () => {
    const candidates = Array.from({ length: MAX_INVITE_CANDIDATES + 1 }, (_, i) => ({
      email: `candidato${i}@ejemplo-ficticio.test`,
      name: `Candidato ${i}`,
    }));

    const res = await POST(request({ ...validBody, candidates }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid request body');
    expect(body.invalidFields).toContain('candidates');
    expect(supabase.writes).toHaveLength(0);
  });

  it(`acepta exactamente ${MAX_INVITE_CANDIDATES} candidatos`, async () => {
    const candidates = Array.from({ length: MAX_INVITE_CANDIDATES }, (_, i) => ({
      email: `candidato${i}@ejemplo-ficticio.test`,
      name: `Candidato ${i}`,
    }));

    const res = await POST(request({ ...validBody, candidates }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(MAX_INVITE_CANDIDATES);
    expect(supabase.writes).toHaveLength(MAX_INVITE_CANDIDATES * 2);

    // Cada invitación lleva su propio token.
    const tokens = new Set(body.results.map((r: { token: string }) => r.token));
    expect(tokens.size).toBe(MAX_INVITE_CANDIDATES);
  });

  it('responde 400 con un array vacío y no escribe nada', async () => {
    const res = await POST(request({ ...validBody, candidates: [] }));

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 400 sin roleId y no escribe nada', async () => {
    const res = await POST(
      request({ roleTitle: 'Backend', candidates: validBody.candidates }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.invalidFields).toContain('roleId');
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 400 con un cuerpo que no es JSON válido', async () => {
    const res = await POST(
      new Request('http://localhost/api/invite-candidates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'no-es-json',
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('descarta las claves que sobran en lugar de rechazar la petición', async () => {
    // Un lote exportado de otra herramienta trae columnas que esta ruta no usa.
    // Se ignoran, y nunca llegan a la base de datos.
    const res = await POST(
      request({
        ...validBody,
        candidates: [
          {
            email: 'candidata@ejemplo-ficticio.test',
            name: 'Candidata',
            telefono: '+34600000000',
          },
        ],
        campoQueSobra: 'valor',
      }),
    );

    expect(res.status).toBe(200);
    expect(JSON.stringify(supabase.tables.candidate_invites[0])).not.toContain(
      '+34600000000',
    );
  });

  it('no devuelve el mensaje de una excepción al cliente', async () => {
    // Un fallo de configuración del cliente de servicio sale como excepción con
    // detalle de entorno en el mensaje. La ruta responde 500 genérico.
    vi.spyOn(supabase.client, 'from').mockImplementation(() => {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    });

    const res = await POST(request(validBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
