// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar la ruta.
vi.mock('server-only', () => ({}));

import { createFakeSupabase } from '../helpers/fake-supabase';

/**
 * Pruebas de autenticación y de tope de tamaño de `/api/invite-candidates`.
 *
 * La ruta crea tickets de entrevista e inserta en `candidate_invites` con la
 * clave de servicio, que bypassa RLS: si la ruta no autentica, no autentica
 * nadie. Antes ni siquiera lo intentaba — el `return` del rechazo estaba
 * comentado y la condición empezaba por `secret &&`, así que omitir la cabecera
 * la saltaba por completo.
 *
 * Lo que se fija aquí:
 *
 *  - sin cabecera → 401 y CERO escrituras;
 *  - cabecera incorrecta → 401 y cero escrituras;
 *  - cabecera correcta → 200, ticket y espejo creados;
 *  - `MAKE_WEBHOOK_SECRET` ausente → 503 y cero escrituras;
 *  - array por encima del tope → 400 y cero escrituras.
 *
 * TODOS LOS SECRETOS SON FICTICIOS. Ninguna credencial real puede entrar en
 * este archivo: quedaría en el historial de git para siempre.
 */

const FAKE_SECRET = 'secreto-ficticio-de-make-0123456789';

const ROLE_ID = 'role-victima';
const ORG_ID = 'org-victima';

const supabase = createFakeSupabase();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabase.client,
}));

import { POST } from '@/app/api/invite-candidates/route';
import { MAX_INVITE_CANDIDATES } from '@/lib/invites/contracts';

function request(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/invite-candidates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const validBody = {
  roleId: ROLE_ID,
  roleTitle: 'Backend',
  candidates: [{ email: 'candidata@ejemplo-ficticio.test', name: 'Candidata' }],
  language: 'es',
};

let originalSecret: string | undefined;
let originalAppUrl: string | undefined;

beforeEach(() => {
  originalSecret = process.env.MAKE_WEBHOOK_SECRET;
  originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.MAKE_WEBHOOK_SECRET = FAKE_SECRET;
  process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo-ficticio.test';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  supabase.reset({ roles: [{ id: ROLE_ID, org_id: ORG_ID }] });
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.MAKE_WEBHOOK_SECRET;
  else process.env.MAKE_WEBHOOK_SECRET = originalSecret;
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  vi.restoreAllMocks();
});

describe('POST /api/invite-candidates — autenticación', () => {
  it('responde 401 sin cabecera x-api-key y no escribe nada', async () => {
    const res = await POST(request(validBody));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(supabase.tables.interview_tickets ?? []).toHaveLength(0);
    expect(supabase.tables.candidate_invites ?? []).toHaveLength(0);
  });

  it('responde 401 con una cabecera incorrecta y no escribe nada', async () => {
    const res = await POST(
      request(validBody, { 'x-api-key': 'secreto-equivocado-0123456789' }),
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 401 con una cabecera vacía', async () => {
    const res = await POST(request(validBody, { 'x-api-key': '' }));

    expect(res.status).toBe(401);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 503 cuando MAKE_WEBHOOK_SECRET no está configurada', async () => {
    delete process.env.MAKE_WEBHOOK_SECRET;

    const res = await POST(request(validBody, { 'x-api-key': FAKE_SECRET }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain('misconfigured');
    // El mensaje nombra la variable, nunca un valor.
    expect(JSON.stringify(body)).not.toContain(FAKE_SECRET);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 503 aunque no venga ninguna cabecera y no haya secreto', async () => {
    delete process.env.MAKE_WEBHOOK_SECRET;

    const res = await POST(request(validBody));

    expect(res.status).toBe(503);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 200 con la cabecera correcta y crea el ticket y su espejo', async () => {
    const res = await POST(request(validBody, { 'x-api-key': FAKE_SECRET }));

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

    expect(supabase.writes).toHaveLength(2);
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
});

describe('POST /api/invite-candidates — validación del cuerpo', () => {
  it(`responde 400 y no escribe con más de ${MAX_INVITE_CANDIDATES} candidatos`, async () => {
    const candidates = Array.from({ length: MAX_INVITE_CANDIDATES + 1 }, (_, i) => ({
      email: `candidato${i}@ejemplo-ficticio.test`,
      name: `Candidato ${i}`,
    }));

    const res = await POST(
      request({ ...validBody, candidates }, { 'x-api-key': FAKE_SECRET }),
    );

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

    const res = await POST(
      request({ ...validBody, candidates }, { 'x-api-key': FAKE_SECRET }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(MAX_INVITE_CANDIDATES);
    expect(supabase.writes).toHaveLength(MAX_INVITE_CANDIDATES * 2);

    // Cada invitación lleva su propio token.
    const tokens = new Set(body.results.map((r: { token: string }) => r.token));
    expect(tokens.size).toBe(MAX_INVITE_CANDIDATES);
  });

  it('responde 400 con un array vacío y no escribe nada', async () => {
    const res = await POST(
      request({ ...validBody, candidates: [] }, { 'x-api-key': FAKE_SECRET }),
    );

    expect(res.status).toBe(400);
    expect(supabase.writes).toHaveLength(0);
  });

  it('responde 400 sin roleId y no escribe nada', async () => {
    const res = await POST(
      request(
        { roleTitle: 'Backend', candidates: validBody.candidates },
        { 'x-api-key': FAKE_SECRET },
      ),
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
        headers: { 'Content-Type': 'application/json', 'x-api-key': FAKE_SECRET },
        body: 'no-es-json',
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('descarta las claves que sobran en lugar de rechazar la petición', async () => {
    // La integración externa envía campos que esta ruta no usa. Se ignoran, y
    // nunca llegan a la base de datos.
    const res = await POST(
      request(
        {
          ...validBody,
          candidates: [
            {
              email: 'candidata@ejemplo-ficticio.test',
              name: 'Candidata',
              telefono: '+34600000000',
            },
          ],
          campoDeMake: 'valor',
        },
        { 'x-api-key': FAKE_SECRET },
      ),
    );

    expect(res.status).toBe(200);
    expect(JSON.stringify(supabase.tables.candidate_invites[0])).not.toContain(
      '+34600000000',
    );
  });
});
