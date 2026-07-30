// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar la ruta.
vi.mock('server-only', () => ({}));

import { createFakeSupabase } from '../helpers/fake-supabase';

/**
 * Pruebas de `/api/interview/ticket` y `/api/interview/ticket/consume`.
 *
 * Estas dos rutas sustituyen a las lecturas y a la escritura que la pantalla
 * `/interview/t/[token]` hacía desde el navegador con la clave anon. Son el
 * requisito previo para retirar `public_ticket_by_token`
 * (`SELECT TO anon USING (true)`) y `anon_tickets_update`
 * (`UPDATE TO anon USING (true)`) de `interview_tickets`, las dos políticas que
 * permitían a cualquiera listar los tokens de todos los candidatos y marcar como
 * usados los tickets ajenos.
 *
 * Lo que se fija aquí:
 *
 *  - token válido → 200 con EXACTAMENTE los campos permitidos, y sin `token`,
 *    `public_token` ni columnas de facturación de `organizations`;
 *  - token inexistente, usado y expirado → su propio estado, sin datos y sin
 *    delatar si el token existe;
 *  - consumo de un ticket disponible → `used = true`, una sola escritura;
 *  - consumo de un ticket ya usado o expirado → rechazado con CERO escrituras.
 *
 * El doble de Supabase NO recorta columnas: devuelve la fila completa que se
 * sembró. Eso es deliberado — así la proyección que se comprueba es la de la
 * ruta, no la del doble.
 */

const supabase = createFakeSupabase();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabase.client,
}));

import { NextRequest } from 'next/server';

import { POST as resolveTicket } from '@/app/api/interview/ticket/route';
import { POST as consumeTicket } from '@/app/api/interview/ticket/consume/route';

const ORG_ID = 'org-ficticia';
const ROLE_ID = 'role-backend';

const VALID_TOKEN = 'TOKENVALIDO123456';
const VALID_EN_TOKEN = 'TOKENVALIDOENGLISH';
const USED_TOKEN = 'TOKENUSADO1234567';
const EXPIRED_TOKEN = 'TOKENEXPIRADO1234';
const USED_AND_EXPIRED_TOKEN = 'TOKENUSADOYEXPIRA';
const UNKNOWN_TOKEN = 'TOKENINEXISTENTE1';

/** `roles.public_token`: la credencial del enlace general de la vacante. */
const ROLE_PUBLIC_TOKEN = 'pub-ficticio-no-debe-salir';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Instante de referencia de la siembra. Se toma del reloj real en cada prueba
 * en lugar de congelarlo: las rutas solo comparan `expires_at` contra
 * `Date.now()`, así que sembrar con margen de una hora es suficiente y evita
 * temporizadores falsos alrededor de código asíncrono.
 */
let NOW = 0;

const VALID_TOPIC = {
  id: 'topic-1',
  label: 'Diseño de sistemas',
  rubric: { excellent: 'ok', acceptable: 'regular', poor: 'mal', weight: 8 },
};

function seed() {
  NOW = Date.now();
  supabase.reset({
    interview_tickets: [
      {
        id: 'ticket-valido',
        token: VALID_TOKEN,
        candidate_name: 'Candidata Ficticia',
        role_id: ROLE_ID,
        language: 'es',
        created_at: NOW - HOUR_MS,
        expires_at: NOW + HOUR_MS,
        used: false,
        org_id: ORG_ID,
      },
      {
        id: 'ticket-valido-en',
        token: VALID_EN_TOKEN,
        candidate_name: 'Fictional Candidate',
        role_id: ROLE_ID,
        language: null,
        created_at: NOW - HOUR_MS,
        expires_at: NOW + HOUR_MS,
        used: null,
        org_id: ORG_ID,
      },
      {
        id: 'ticket-usado',
        token: USED_TOKEN,
        candidate_name: 'Ya Entrevistado',
        role_id: ROLE_ID,
        language: 'es',
        created_at: NOW - HOUR_MS,
        expires_at: NOW + HOUR_MS,
        used: true,
        org_id: ORG_ID,
      },
      {
        id: 'ticket-expirado',
        token: EXPIRED_TOKEN,
        candidate_name: 'Llegó Tarde',
        role_id: ROLE_ID,
        language: 'es',
        created_at: NOW - 48 * HOUR_MS,
        expires_at: NOW - HOUR_MS,
        used: false,
        org_id: ORG_ID,
      },
      {
        id: 'ticket-usado-y-expirado',
        token: USED_AND_EXPIRED_TOKEN,
        candidate_name: 'Usado Y Vencido',
        role_id: ROLE_ID,
        language: 'es',
        created_at: NOW - 48 * HOUR_MS,
        expires_at: NOW - HOUR_MS,
        used: true,
        org_id: ORG_ID,
      },
    ],
    roles: [
      {
        id: ROLE_ID,
        org_id: ORG_ID,
        title: 'Backend',
        description: 'Servicios de la plataforma',
        location: 'Remoto',
        salary: '100k',
        job_type: 'full-time',
        interview_duration: 45,
        interview_mode: 'internal',
        // El segundo criterio está corrupto: debe descartarse sin invalidar el
        // puesto ni dejar al candidato fuera.
        topics: [VALID_TOPIC, { label: 'sin id' }],
        public_token: ROLE_PUBLIC_TOKEN,
        is_published: true,
      },
    ],
    organizations: [
      {
        id: ORG_ID,
        name: 'Empresa Ficticia',
        slug: 'empresa-ficticia',
        plan_tier: 'enterprise',
        // Columnas que NUNCA deben salir por esta ruta.
        stripe_customer_id: 'cus_ficticio',
        stripe_subscription_id: 'sub_ficticio',
        subscription_status: 'active',
        billing_interval: 'month',
        max_interviews_per_month: 500,
      },
    ],
  });
}

function resolveRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/interview/ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function consumeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/interview/ticket/consume', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Fila viva del doble, para comprobar qué quedó escrito. */
function ticketRow(token: string) {
  const row = supabase.tables.interview_tickets.find((entry) => entry.token === token);
  if (!row) throw new Error(`La fila sembrada desapareció: ${token}`);
  return row;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/interview/ticket — token válido', () => {
  it('devuelve solo los campos que la entrevista necesita', async () => {
    const res = await resolveTicket(resolveRequest({ token: VALID_TOKEN }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'valid',
      ticket: {
        candidateName: 'Candidata Ficticia',
        roleId: ROLE_ID,
        language: 'es',
        expiresAt: NOW + HOUR_MS,
        used: false,
      },
      role: {
        id: ROLE_ID,
        title: 'Backend',
        description: 'Servicios de la plataforma',
        location: 'Remoto',
        salary: '100k',
        jobType: 'full-time',
        interviewDuration: 45,
        interviewMode: 'internal',
        topics: [VALID_TOPIC],
      },
      org: { planTier: 'enterprise' },
    });
  });

  it('no filtra el token, el public_token ni las columnas de facturación', async () => {
    const res = await resolveTicket(resolveRequest({ token: VALID_TOKEN }));
    const body = await res.text();

    // El token es la credencial: no vuelve al cliente que ya lo tiene.
    expect(body).not.toContain(VALID_TOKEN);
    expect(body).not.toContain('token');
    // El enlace general de la vacante es otra credencial.
    expect(body).not.toContain(ROLE_PUBLIC_TOKEN);
    // `organizations` guarda los datos de facturación.
    expect(body).not.toContain('cus_ficticio');
    expect(body).not.toContain('sub_ficticio');
    expect(body).not.toContain('subscription_status');
    expect(body).not.toContain('max_interviews_per_month');
    expect(body).not.toContain('Empresa Ficticia');
  });

  it('resolver un ticket no lo consume ni escribe nada', async () => {
    await resolveTicket(resolveRequest({ token: VALID_TOKEN }));

    expect(supabase.writes).toHaveLength(0);
    expect(ticketRow(VALID_TOKEN).used).toBe(false);
  });

  it('aplica los valores por defecto de idioma y de uso cuando la fila trae nulos', async () => {
    const res = await resolveTicket(resolveRequest({ token: VALID_EN_TOKEN }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ticket.language).toBe('es');
    expect(body.ticket.used).toBe(false);
  });
});

describe('POST /api/interview/ticket — rechazos', () => {
  it('un token inexistente responde not_found sin más datos', async () => {
    const res = await resolveTicket(resolveRequest({ token: UNKNOWN_TOKEN }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ status: 'not_found' });
  });

  it('un ticket ya usado responde used', async () => {
    const res = await resolveTicket(resolveRequest({ token: USED_TOKEN }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: 'used' });
  });

  it('un ticket expirado responde expired', async () => {
    const res = await resolveTicket(resolveRequest({ token: EXPIRED_TOKEN }));

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({ status: 'expired' });
  });

  it('un ticket usado y expirado responde used, como hacía la pantalla', async () => {
    const res = await resolveTicket(resolveRequest({ token: USED_AND_EXPIRED_TOKEN }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: 'used' });
  });

  it('un ticket cuyo puesto ya no existe responde not_found', async () => {
    supabase.tables.roles = [];

    const res = await resolveTicket(resolveRequest({ token: VALID_TOKEN }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ status: 'not_found' });
  });

  it('un cuerpo sin token responde not_found y no lee la tabla', async () => {
    for (const body of [{}, { token: '' }, { token: '   ' }, { token: 123 }, []]) {
      const res = await resolveTicket(resolveRequest(body));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ status: 'not_found' });
    }

    expect(supabase.writes).toHaveLength(0);
  });

  it('los cuatro rechazos comparten la forma de la respuesta', async () => {
    const bodies = await Promise.all(
      [UNKNOWN_TOKEN, USED_TOKEN, EXPIRED_TOKEN].map(async (token) => {
        const res = await resolveTicket(resolveRequest({ token }));
        return res.json();
      }),
    );

    // Solo `status`: ningún rechazo añade pistas sobre el ticket ni sobre si el
    // token existe.
    for (const body of bodies) {
      expect(Object.keys(body)).toEqual(['status']);
    }
  });
});

describe('POST /api/interview/ticket/consume', () => {
  it('marca used = true en un ticket disponible', async () => {
    const res = await consumeTicket(consumeRequest({ token: VALID_TOKEN }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'consumed' });
    expect(ticketRow(VALID_TOKEN).used).toBe(true);
    expect(supabase.writes).toHaveLength(1);
    expect(supabase.writes[0]).toMatchObject({
      table: 'interview_tickets',
      op: 'update',
      payload: { used: true },
    });
  });

  it('solo escribe la columna used', async () => {
    await consumeTicket(consumeRequest({ token: VALID_TOKEN }));

    expect(Object.keys(supabase.writes[0].payload)).toEqual(['used']);
    expect(ticketRow(VALID_TOKEN)).toMatchObject({
      candidate_name: 'Candidata Ficticia',
      role_id: ROLE_ID,
      expires_at: NOW + HOUR_MS,
    });
  });

  it('rechaza un ticket ya usado sin escribir', async () => {
    const res = await consumeTicket(consumeRequest({ token: USED_TOKEN }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: 'used' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('rechaza un ticket expirado sin escribir y lo deja disponible', async () => {
    const res = await consumeTicket(consumeRequest({ token: EXPIRED_TOKEN }));

    expect(res.status).toBe(410);
    await expect(res.json()).resolves.toEqual({ status: 'expired' });
    expect(supabase.writes).toHaveLength(0);
    expect(ticketRow(EXPIRED_TOKEN).used).toBe(false);
  });

  it('rechaza un token inexistente sin escribir', async () => {
    const res = await consumeTicket(consumeRequest({ token: UNKNOWN_TOKEN }));

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ status: 'not_found' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('rechaza el identificador del ticket en lugar del token', async () => {
    const res = await consumeTicket(consumeRequest({ token: 'ticket-valido' }));

    expect(res.status).toBe(404);
    expect(supabase.writes).toHaveLength(0);
    expect(ticketRow(VALID_TOKEN).used).toBe(false);
  });

  it('un segundo consumo del mismo token no vuelve a escribir', async () => {
    await consumeTicket(consumeRequest({ token: VALID_TOKEN }));
    const res = await consumeTicket(consumeRequest({ token: VALID_TOKEN }));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ status: 'used' });
    expect(supabase.writes).toHaveLength(1);
    expect(ticketRow(VALID_TOKEN).used).toBe(true);
  });

  it('un fallo de escritura no se reporta como consumo', async () => {
    supabase.updateErrors.set('interview_tickets', { message: 'fallo simulado' });

    const res = await consumeTicket(consumeRequest({ token: VALID_TOKEN }));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.not.toEqual({ status: 'consumed' });
    expect(ticketRow(VALID_TOKEN).used).toBe(false);
  });
});
