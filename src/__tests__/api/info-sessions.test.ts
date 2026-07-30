// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar las rutas.
vi.mock('server-only', () => ({}));

import { createFakeSupabase, type FakeRow } from '../helpers/fake-supabase';

/**
 * Pruebas de `/api/info-sessions`, `/api/info-sessions/sync` y
 * `/api/info-sessions/state`.
 *
 * Las tres rutas sustituyen a lo que `/informes/[courseId]` hacía con la clave
 * anon, y son el requisito previo para retirar de `info_sessions` las políticas
 * `anon_insert_sessions` (`WITH CHECK (true)`), `anon_read_own_session` y
 * `anon_update_own_session` (`USING (true)`), que permitían a cualquier visitante
 * listar y reescribir las sesiones de todas las organizaciones.
 *
 * Lo que se fija aquí es el contrato HTTP, no la lógica del servicio (eso está en
 * `info-sessions-service.test.ts`):
 *
 *  - cuerpo ilegible o que no cumple el esquema → `400`;
 *  - credencial que no corresponde → `403`;
 *  - curso inexistente o inactivo → `404`;
 *  - fallo de la base → `500`, sin disfrazarse de rechazo;
 *  - creación correcta → `200` con la credencial en claro, una sola vez.
 *
 * El cuerpo de la respuesta es SIEMPRE uno de los estados del contrato: es el
 * código HTTP el que distingue los casos, de modo que el cliente no tenga que
 * interpretar formas distintas.
 */

const supabase = createFakeSupabase();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabase.client,
}));

import { NextRequest } from 'next/server';

import { POST as createSession } from '@/app/api/info-sessions/route';
import { POST as syncSession } from '@/app/api/info-sessions/sync/route';
import { POST as readSessionState } from '@/app/api/info-sessions/state/route';
import {
  INFO_SESSION_CREATE_PATH,
  INFO_SESSION_STATE_PATH,
  INFO_SESSION_SYNC_PATH,
} from '@/lib/info-sessions/client';
import { hashInfoSessionAccessToken } from '@/lib/info-sessions/service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const COURSE_ID = '33333333-3333-4333-8333-333333333333';
const INACTIVE_COURSE_ID = '44444444-4444-4444-8444-444444444444';
const UNKNOWN_COURSE_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '66666666-6666-4666-8666-666666666666';

const SESSION_TOKEN = 'token-de-la-sesion-sembrada';
const FOREIGN_TOKEN = 'token-de-otra-sesion';

function seed() {
  supabase.reset({
    courses: [
      { id: COURSE_ID, org_id: ORG_ID, is_active: true, title: 'Curso activo' },
      { id: INACTIVE_COURSE_ID, org_id: ORG_ID, is_active: false, title: 'Retirado' },
    ],
    info_sessions: [
      {
        id: SESSION_ID,
        course_id: COURSE_ID,
        org_id: ORG_ID,
        client_name: 'Cliente Ficticio',
        client_email: 'cliente@ejemplo.test',
        status: 'active',
        closing_mode: null,
        coach_notified: false,
        access_token_hash: hashInfoSessionAccessToken(SESSION_TOKEN),
      },
    ],
  });
}

function jsonRequest(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Petición con un cuerpo que no es JSON, para el camino del `400`. */
function brokenRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'esto no es json',
  });
}

function sessionRow(id: string = SESSION_ID): FakeRow {
  const row = supabase.tables.info_sessions.find((entry) => entry.id === id);
  if (!row) throw new Error(`La fila sembrada desapareció: ${id}`);
  return row;
}

const CREATE_BODY = { courseId: COURSE_ID, clientName: 'Cliente Nuevo' };
const SYNC_BODY = {
  sessionId: SESSION_ID,
  accessToken: SESSION_TOKEN,
  patch: { status: 'closed_remote' },
};
const STATE_BODY = { sessionId: SESSION_ID, accessToken: SESSION_TOKEN };

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/info-sessions — creación', () => {
  it('devuelve el accessToken en claro una sola vez', async () => {
    const res = await createSession(jsonRequest(INFO_SESSION_CREATE_PATH, CREATE_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('created');
    expect(typeof body.accessToken).toBe('string');
    expect(body.accessToken.length).toBeGreaterThan(0);
    expect(typeof body.sessionId).toBe('string');
    expect(Object.keys(body).sort()).toEqual(['accessToken', 'sessionId', 'status']);
  });

  it('la fila creada guarda el hash del token y hereda el org_id del curso', async () => {
    const res = await createSession(jsonRequest(INFO_SESSION_CREATE_PATH, CREATE_BODY));
    const body = await res.json();

    const row = sessionRow(body.sessionId);
    expect(row.access_token_hash).toBe(hashInfoSessionAccessToken(body.accessToken));
    expect(row.org_id).toBe(ORG_ID);
    expect(JSON.stringify(row)).not.toContain(body.accessToken);
  });

  it('un cuerpo que no es JSON responde 400 sin tocar la tabla', async () => {
    const res = await createSession(brokenRequest(INFO_SESSION_CREATE_PATH));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ status: 'course_not_found' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('un cuerpo que no cumple el esquema responde 400', async () => {
    for (const body of [
      {},
      { courseId: 'no-es-uuid', clientName: 'Cliente' },
      { courseId: COURSE_ID },
      { courseId: COURSE_ID, clientName: '' },
      // `orgId` no se acepta: lo resuelve el servidor desde el curso.
      { courseId: COURSE_ID, clientName: 'Cliente', orgId: ORG_ID },
    ]) {
      const res = await createSession(jsonRequest(INFO_SESSION_CREATE_PATH, body));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ status: 'course_not_found' });
    }

    expect(supabase.writes).toHaveLength(0);
  });

  it('un curso inexistente o inactivo responde 404', async () => {
    for (const courseId of [UNKNOWN_COURSE_ID, INACTIVE_COURSE_ID]) {
      const res = await createSession(
        jsonRequest(INFO_SESSION_CREATE_PATH, { courseId, clientName: 'Cliente' }),
      );

      expect(res.status).toBe(404);
      await expect(res.json()).resolves.toEqual({ status: 'course_not_found' });
    }

    expect(supabase.writes).toHaveLength(0);
  });

  it('un fallo de la base responde 500 y no un 404 que negaría el curso', async () => {
    supabase.selectErrors.set('courses', { message: 'fallo simulado' });

    const res = await createSession(jsonRequest(INFO_SESSION_CREATE_PATH, CREATE_BODY));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ status: 'course_not_found' });
    expect(supabase.writes).toHaveLength(0);
  });
});

describe('POST /api/info-sessions/sync — escritura', () => {
  it('la credencial correcta responde 200 y aplica la escritura', async () => {
    const res = await syncSession(jsonRequest(INFO_SESSION_SYNC_PATH, SYNC_BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: 'updated' });
    expect(sessionRow().status).toBe('closed_remote');
  });

  it('un cuerpo que no es JSON responde 400 sin escribir', async () => {
    const res = await syncSession(brokenRequest(INFO_SESSION_SYNC_PATH));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('un cuerpo que no cumple el esquema responde 400 sin escribir', async () => {
    for (const body of [
      {},
      { sessionId: SESSION_ID, patch: { status: 'active' } },
      { sessionId: SESSION_ID, accessToken: SESSION_TOKEN },
      { sessionId: SESSION_ID, accessToken: SESSION_TOKEN, patch: {} },
      // Estados y columnas que el cliente no puede fijar.
      {
        sessionId: SESSION_ID,
        accessToken: SESSION_TOKEN,
        patch: { status: 'completed' },
      },
      {
        sessionId: SESSION_ID,
        accessToken: SESSION_TOKEN,
        patch: { conversion_result: 'converted' },
      },
      {
        sessionId: SESSION_ID,
        accessToken: SESSION_TOKEN,
        patch: { coach_notified: true },
      },
    ]) {
      const res = await syncSession(jsonRequest(INFO_SESSION_SYNC_PATH, body));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
    }

    expect(supabase.writes).toHaveLength(0);
    expect(sessionRow().status).toBe('active');
  });

  it('una credencial que no corresponde responde 403 sin escribir', async () => {
    const res = await syncSession(
      jsonRequest(INFO_SESSION_SYNC_PATH, { ...SYNC_BODY, accessToken: FOREIGN_TOKEN }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(sessionRow().status).toBe('active');
  });

  it('un fallo de la base responde 500 y no un 403', async () => {
    supabase.updateErrors.set('info_sessions', { message: 'fallo simulado' });

    const res = await syncSession(jsonRequest(INFO_SESSION_SYNC_PATH, SYNC_BODY));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
    expect(sessionRow().status).toBe('active');
  });
});

describe('POST /api/info-sessions/state — lectura', () => {
  it('la credencial correcta responde 200 con el estado y el aviso', async () => {
    sessionRow().status = 'completed';
    sessionRow().coach_notified = true;

    const res = await readSessionState(jsonRequest(INFO_SESSION_STATE_PATH, STATE_BODY));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      status: 'ok',
      sessionStatus: 'completed',
      coachNotified: true,
    });
  });

  it('no devuelve ningún otro dato de la sesión', async () => {
    const res = await readSessionState(jsonRequest(INFO_SESSION_STATE_PATH, STATE_BODY));
    const body = await res.text();

    expect(body).not.toContain('Cliente Ficticio');
    expect(body).not.toContain('cliente@ejemplo.test');
    expect(body).not.toContain(ORG_ID);
    expect(body).not.toContain('access_token_hash');
  });

  it('un cuerpo que no es JSON responde 400', async () => {
    const res = await readSessionState(brokenRequest(INFO_SESSION_STATE_PATH));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
  });

  it('un cuerpo que no cumple el esquema responde 400', async () => {
    for (const body of [
      {},
      { sessionId: SESSION_ID },
      { accessToken: SESSION_TOKEN },
      { sessionId: 'no-es-uuid', accessToken: SESSION_TOKEN },
    ]) {
      const res = await readSessionState(jsonRequest(INFO_SESSION_STATE_PATH, body));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
    }
  });

  it('una credencial que no corresponde responde 403', async () => {
    const res = await readSessionState(
      jsonRequest(INFO_SESSION_STATE_PATH, { ...STATE_BODY, accessToken: FOREIGN_TOKEN }),
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
  });

  it('un fallo de la base responde 500 y no un 403', async () => {
    supabase.selectErrors.set('info_sessions', { message: 'fallo simulado' });

    const res = await readSessionState(jsonRequest(INFO_SESSION_STATE_PATH, STATE_BODY));

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ status: 'unauthorized' });
  });

  it('la lectura no escribe nada', async () => {
    await readSessionState(jsonRequest(INFO_SESSION_STATE_PATH, STATE_BODY));

    expect(supabase.writes).toHaveLength(0);
  });
});
