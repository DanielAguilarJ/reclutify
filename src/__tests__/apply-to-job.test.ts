// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar el server action.
vi.mock('server-only', () => ({}));

import { createFakeSupabase } from './helpers/fake-supabase';

/**
 * Pruebas de `applyToJob` (postulación pública a una vacante).
 *
 * Este server action era el obstáculo que mantenía abierto
 * `/api/invite-candidates`: llamaba al endpoint por HTTP y sin cabecera
 * `x-api-key`, así que activar el rechazo rompía las postulaciones. Ahora invoca
 * `createCandidateInvites` directamente.
 *
 * Lo que se fija aquí:
 *
 *  - la invitación se crea sin ninguna petición HTTP;
 *  - la detección de duplicados y el carácter no bloqueante del fallo de la
 *    invitación no cambian;
 *  - el `interviewUrl` que se devuelve es el enlace por token del servicio
 *    (`/interview/t/{token}`) y no la URL heredada
 *    `/interview?candidateId=...&roleId=...`, que apuntaba a una ruta
 *    inexistente;
 *  - cuando no hay enlace utilizable, el campo llega sin valor en lugar de con
 *    una URL rota.
 */

const ROLE_ID = 'role-publicado';
const ORG_ID = 'org-publicadora';

/** Cliente de sesión: lo que ve `applyToJob` a través de `createClient()`. */
const sessionSupabase = createFakeSupabase();
/** Cliente de servicio: lo que usa el módulo de invitaciones. */
const adminSupabase = createFakeSupabase();

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => sessionSupabase.client,
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => adminSupabase.client,
}));

import { applyToJob } from '@/app/actions/jobs';

const application = {
  roleId: ROLE_ID,
  orgId: ORG_ID,
  name: '  Candidata Nueva  ',
  email: '  Candidata@Ejemplo-Ficticio.test ',
  phone: ' +34600000000 ',
};

let fetchSpy: ReturnType<typeof vi.spyOn>;

/**
 * Variables que lee `resolveAppBaseUrl()`. Se limpian todas y solo se fija la
 * explícita: si el entorno de quien ejecuta las pruebas trae un `VERCEL_URL`, el
 * enlace esperado dejaría de coincidir sin que nada esté roto.
 */
const BASE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
  'PORT',
] as const;

let originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  originalEnv = {};
  for (const key of BASE_URL_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.NEXT_PUBLIC_APP_URL = 'https://ejemplo-ficticio.test';
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // Cualquier petición HTTP es un fallo de la prueba: el server action ya corre
  // en el servidor y no debe volver a entrar por su propio backend.
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
    throw new Error('applyToJob no debe hacer peticiones HTTP');
  });

  sessionSupabase.reset({
    candidates: [],
    roles: [{ id: ROLE_ID, org_id: ORG_ID, title: 'Backend' }],
  });
  adminSupabase.reset({
    roles: [{ id: ROLE_ID, org_id: ORG_ID, title: 'Backend' }],
  });
});

afterEach(() => {
  for (const key of BASE_URL_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.restoreAllMocks();
});

describe('applyToJob', () => {
  it('crea la invitación sin pasar por HTTP', async () => {
    const result = await applyToJob(application);

    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    // El candidato se registra con el correo normalizado.
    expect(sessionSupabase.tables.candidates).toHaveLength(1);
    expect(sessionSupabase.tables.candidates[0]).toMatchObject({
      email: 'candidata@ejemplo-ficticio.test',
      name: 'Candidata Nueva',
      role_id: ROLE_ID,
      org_id: ORG_ID,
      source: 'career-fair',
    });

    // Y la invitación pasa por el módulo compartido, con la clave de servicio.
    expect(adminSupabase.writes.map((write) => write.table)).toEqual([
      'interview_tickets',
      'candidate_invites',
    ]);

    const ticket = adminSupabase.tables.interview_tickets[0];
    expect(ticket).toMatchObject({
      role_id: ROLE_ID,
      org_id: ORG_ID,
      candidate_name: 'Candidata Nueva',
      language: 'es',
      used: false,
    });

    expect(adminSupabase.tables.candidate_invites[0]).toMatchObject({
      id: 'candidata@ejemplo-ficticio.test',
      role_id: ROLE_ID,
      role_title: 'Backend',
      status: 'pending',
      interview_link: `https://ejemplo-ficticio.test/interview/t/${ticket.token}`,
    });
  });

  it('devuelve el enlace por token del ticket que acaba de crear', async () => {
    const result = await applyToJob(application);

    expect(result.success).toBe(true);

    // El enlace tiene que ser el del ticket recién insertado: es el único
    // formato que abre la entrevista. La URL heredada
    // `/interview?candidateId=...&roleId=...` no resuelve a ninguna ruta.
    const ticket = adminSupabase.tables.interview_tickets[0];
    expect(result.interviewUrl).toBe(
      `https://ejemplo-ficticio.test/interview/t/${ticket.token}`,
    );

    // Y es exactamente el mismo enlace que se registra en la invitación y viaja
    // al correo del candidato.
    expect(adminSupabase.tables.candidate_invites[0].interview_link).toBe(
      result.interviewUrl,
    );
  });

  it('no usa el dominio de reserva propio: la URL base sale de la cascada compartida', async () => {
    // Sin `NEXT_PUBLIC_APP_URL` la URL base la resuelve `resolveAppBaseUrl()`
    // dentro del servicio de invitaciones. El action ya no construye URLs, así
    // que no puede reintroducir un segundo dominio de reserva.
    delete process.env.NEXT_PUBLIC_APP_URL;

    const result = await applyToJob(application);
    const ticket = adminSupabase.tables.interview_tickets[0];

    expect(result.success).toBe(true);
    expect(result.interviewUrl).toBe(
      `http://localhost:3000/interview/t/${ticket.token}`,
    );
  });

  it('rechaza una postulación duplicada sin crear invitación', async () => {
    sessionSupabase.reset({
      candidates: [
        {
          id: 'cand-existente',
          email: 'candidata@ejemplo-ficticio.test',
          role_id: ROLE_ID,
        },
      ],
      roles: [{ id: ROLE_ID, org_id: ORG_ID, title: 'Backend' }],
    });

    const result = await applyToJob(application);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Ya has aplicado');
    expect(adminSupabase.writes).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('no crea invitación si falla el registro del candidato', async () => {
    sessionSupabase.insertErrors.set('candidates', { message: 'insert bloqueado' });

    const result = await applyToJob(application);

    expect(result.success).toBe(false);
    expect(adminSupabase.writes).toHaveLength(0);
  });

  it('la postulación sigue siendo exitosa si falla la creación del ticket', async () => {
    // El fallo de la invitación no bloquea: es el mismo comportamiento que tenía
    // el `fetch` envuelto en try/catch.
    adminSupabase.insertErrors.set('interview_tickets', { message: 'ticket bloqueado' });

    const result = await applyToJob(application);

    expect(result.success).toBe(true);
    expect(adminSupabase.tables.interview_tickets ?? []).toHaveLength(0);
    expect(adminSupabase.tables.candidate_invites).toHaveLength(1);

    // Sin ticket, `/interview/t/{token}` es la pantalla de ticket inválido. Se
    // devuelve la postulación sin enlace: `ApplyForm` confirma que se registró y
    // no pinta el botón de entrevista.
    expect(result.interviewUrl).toBeUndefined();
  });

  it('omite el enlace si la invitación no quedó registrada por completo', async () => {
    // Aquí el ticket sí se escribe y solo falla el espejo de seguimiento. Se
    // omite igual el enlace: el criterio es el `inserted` del servicio, y ante la
    // duda es mejor una confirmación sin botón que un botón hacia un error.
    adminSupabase.insertErrors.set('candidate_invites', { message: 'espejo bloqueado' });

    const result = await applyToJob(application);

    expect(result.success).toBe(true);
    expect(adminSupabase.tables.interview_tickets).toHaveLength(1);
    expect(adminSupabase.tables.candidate_invites ?? []).toHaveLength(0);
    expect(result.interviewUrl).toBeUndefined();
  });

  it('devuelve la postulación sin enlace si la invitación lanza una excepción', async () => {
    // Un fallo de configuración del cliente de servicio (por ejemplo,
    // `SUPABASE_SERVICE_ROLE_KEY` ausente) sale del servicio como excepción.
    vi.spyOn(adminSupabase.client, 'from').mockImplementation(() => {
      throw new Error('cliente de servicio no configurado');
    });

    const result = await applyToJob(application);

    expect(result.success).toBe(true);
    expect(result.interviewUrl).toBeUndefined();
    // La postulación queda registrada de todos modos: sigue sin bloquear.
    expect(sessionSupabase.tables.candidates).toHaveLength(1);
  });
});
