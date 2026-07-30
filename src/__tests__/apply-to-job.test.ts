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
 *  - el resultado observable de `applyToJob` no cambia (mismo `interviewUrl`,
 *    misma detección de duplicados, mismo carácter no bloqueante del fallo de
 *    la invitación).
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
let originalAppUrl: string | undefined;

beforeEach(() => {
  originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
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
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
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

  it('devuelve el mismo interviewUrl que antes del cambio', async () => {
    const result = await applyToJob(application);

    expect(result.success).toBe(true);
    expect(result.interviewUrl).toBe(
      'https://ejemplo-ficticio.test/interview?candidateId=candidata%40ejemplo-ficticio.test&roleId=role-publicado',
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
  });
});
