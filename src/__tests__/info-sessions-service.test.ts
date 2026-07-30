// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar el servicio.
vi.mock('server-only', () => ({}));

import { createFakeSupabase, type FakeRow } from './helpers/fake-supabase';

/**
 * Pruebas de `src/lib/info-sessions/service.ts`.
 *
 * Este servicio es el único escritor de `info_sessions` para un cliente sin
 * cuenta y corre con `service_role`, que IGNORA RLS. Por tanto la autorización
 * ocurre aquí, en el código, y es exactamente lo que estas pruebas fijan:
 *
 *  - el `org_id` de la sesión sale del CURSO, no del cuerpo de la petición, así
 *    que nadie puede colgar su sesión del panel de una organización ajena;
 *  - en la base queda el HASH del token y nunca el token, de modo que un volcado
 *    de la tabla no permita escribir en sesiones ajenas;
 *  - la credencial es parte del FILTRO del `UPDATE` y del `SELECT`, no un `if`
 *    previo: si el par `{ id, access_token_hash }` no coincide, no se escribe ni
 *    se lee nada;
 *  - la escritura toca solo las columnas presentes en el `patch`.
 *
 * El doble de Supabase aplica las escrituras de verdad sobre tablas en memoria y
 * registra cada una, así que se puede exigir tanto "la fila quedó así" como "no
 * hubo ninguna escritura".
 */

const supabase = createFakeSupabase();

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => supabase.client,
}));

import {
  createInfoSession,
  hashInfoSessionAccessToken,
  issueInfoSessionAccessToken,
  readInfoSessionState,
  updateInfoSession,
} from '@/lib/info-sessions/service';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ID = '22222222-2222-4222-8222-222222222222';
const COURSE_ID = '33333333-3333-4333-8333-333333333333';
const INACTIVE_COURSE_ID = '44444444-4444-4444-8444-444444444444';
const UNKNOWN_COURSE_ID = '55555555-5555-4555-8555-555555555555';

const SESSION_ID = '66666666-6666-4666-8666-666666666666';
const UNKNOWN_SESSION_ID = '77777777-7777-4777-8777-777777777777';

/** Credencial de la sesión sembrada. En la fila solo va su hash. */
const SESSION_TOKEN = 'token-de-la-sesion-sembrada';
/** Credencial de otra sesión: sirve para probar el cruce de token y sesión. */
const FOREIGN_TOKEN = 'token-de-otra-sesion';

const SEEDED_TRANSCRIPT = [{ role: 'assistant', content: 'Hola', timestamp: 1 }];

function seed() {
  supabase.reset({
    courses: [
      { id: COURSE_ID, org_id: ORG_ID, is_active: true, title: 'Curso activo' },
      {
        id: INACTIVE_COURSE_ID,
        org_id: OTHER_ORG_ID,
        is_active: false,
        title: 'Curso retirado',
      },
    ],
    info_sessions: [
      {
        id: SESSION_ID,
        course_id: COURSE_ID,
        org_id: ORG_ID,
        client_name: 'Cliente Ficticio',
        client_email: 'cliente@ejemplo.test',
        client_phone: '600000000',
        status: 'active',
        closing_mode: null,
        coach_notified: false,
        conversion_result: null,
        transcript: SEEDED_TRANSCRIPT,
        objections_detected: [],
        access_token_hash: hashInfoSessionAccessToken(SESSION_TOKEN),
      },
    ],
  });
}

/** Fila viva del doble, para comprobar qué quedó escrito. */
function sessionRow(id: string = SESSION_ID): FakeRow {
  const row = supabase.tables.info_sessions.find((entry) => entry.id === id);
  if (!row) throw new Error(`La fila sembrada desapareció: ${id}`);
  return row;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  seed();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('hashInfoSessionAccessToken', () => {
  it('devuelve SHA-256 en 64 caracteres hexadecimales', () => {
    expect(hashInfoSessionAccessToken(SESSION_TOKEN)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('es estable para la misma entrada: es lo que permite localizar la fila', () => {
    const first = hashInfoSessionAccessToken(SESSION_TOKEN);
    const second = hashInfoSessionAccessToken(SESSION_TOKEN);

    expect(second).toBe(first);
  });

  it('distingue tokens distintos, incluso si solo cambia un carácter', () => {
    expect(hashInfoSessionAccessToken(SESSION_TOKEN)).not.toBe(
      hashInfoSessionAccessToken(`${SESSION_TOKEN}x`),
    );
  });

  it('no contiene el token: del hash no se reconstruye la credencial', () => {
    expect(hashInfoSessionAccessToken(SESSION_TOKEN)).not.toContain(SESSION_TOKEN);
  });
});

describe('issueInfoSessionAccessToken', () => {
  it('devuelve un token distinto en llamadas sucesivas', () => {
    expect(issueInfoSessionAccessToken()).not.toBe(issueInfoSessionAccessToken());
  });

  it('no repite ninguno en una tanda: es una credencial, no un identificador', () => {
    const tokens = Array.from({ length: 64 }, () => issueInfoSessionAccessToken());

    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('viaja sin escapes: base64url, sin relleno', () => {
    expect(issueInfoSessionAccessToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('createInfoSession', () => {
  const input = {
    courseId: COURSE_ID,
    clientName: 'Cliente Nuevo',
    clientEmail: 'nuevo@ejemplo.test',
    clientPhone: '611111111',
    clientOccupation: 'Diseñadora',
    courseFor: 'Para mí',
    clientAge: 30,
  };

  it('crea la sesión y devuelve el identificador insertado', async () => {
    const result = await createInfoSession(input);

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;

    expect(supabase.tables.info_sessions).toHaveLength(2);
    expect(sessionRow(result.sessionId)).toMatchObject({
      course_id: COURSE_ID,
      client_name: 'Cliente Nuevo',
      status: 'active',
    });
  });

  it('resuelve el org_id desde courses y lo escribe en la fila', async () => {
    const result = await createInfoSession(input);

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;

    // El `org_id` no viene del cliente: sale del curso. Si viniera del cuerpo,
    // bastaría cambiarlo para meter la sesión en el panel de otra organización.
    expect(sessionRow(result.sessionId).org_id).toBe(ORG_ID);

    const insert = supabase.writes.find((write) => write.table === 'info_sessions');
    expect(insert?.payload.org_id).toBe(ORG_ID);
  });

  it('guarda el hash del token devuelto y nunca el token en claro', async () => {
    const result = await createInfoSession(input);

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;

    const row = sessionRow(result.sessionId);
    expect(row.access_token_hash).toBe(hashInfoSessionAccessToken(result.accessToken));

    // Ni la fila ni el payload del `INSERT` contienen la credencial en claro: un
    // volcado de la tabla no basta para escribir en la sesión.
    expect(JSON.stringify(row)).not.toContain(result.accessToken);
    expect(JSON.stringify(supabase.writes)).not.toContain(result.accessToken);
    expect(Object.keys(row)).not.toContain('access_token');
  });

  it('emite una credencial distinta por sesión', async () => {
    const first = await createInfoSession(input);
    const second = await createInfoSession(input);

    expect(first.status).toBe('created');
    expect(second.status).toBe('created');
    if (first.status !== 'created' || second.status !== 'created') return;

    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it('normaliza a null los datos de contacto que el cliente no aportó', async () => {
    const result = await createInfoSession({
      courseId: COURSE_ID,
      clientName: 'Solo Nombre',
    });

    expect(result.status).toBe('created');
    if (result.status !== 'created') return;

    expect(sessionRow(result.sessionId)).toMatchObject({
      client_email: null,
      client_phone: null,
      client_age: null,
      client_occupation: null,
      course_for: null,
    });
  });

  it('un curso inexistente responde course_not_found sin escribir', async () => {
    const result = await createInfoSession({ ...input, courseId: UNKNOWN_COURSE_ID });

    expect(result).toEqual({ status: 'course_not_found' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('un curso inactivo responde course_not_found, igual que uno inexistente', async () => {
    const result = await createInfoSession({ ...input, courseId: INACTIVE_COURSE_ID });

    expect(result).toEqual({ status: 'course_not_found' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('un fallo al leer el curso responde error y no un 404 que negaría el curso', async () => {
    supabase.selectErrors.set('courses', { message: 'fallo simulado' });

    const result = await createInfoSession(input);

    expect(result).toEqual({ status: 'error' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('un fallo al insertar la sesión responde error', async () => {
    supabase.insertErrors.set('info_sessions', { message: 'fallo simulado' });

    const result = await createInfoSession(input);

    expect(result).toEqual({ status: 'error' });
    expect(supabase.tables.info_sessions).toHaveLength(1);
  });
});

describe('updateInfoSession — credencial correcta', () => {
  it('aplica la escritura y responde updated', async () => {
    const result = await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { status: 'closed_presential' },
    });

    expect(result).toEqual({ status: 'updated' });
    expect(sessionRow().status).toBe('closed_presential');
    expect(supabase.writes).toHaveLength(1);
  });

  it('escribe solo las columnas del patch presentes, más updated_at', async () => {
    await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { status: 'closed_remote' },
    });

    expect(Object.keys(supabase.writes[0].payload).sort()).toEqual([
      'status',
      'updated_at',
    ]);
    // Lo que el `patch` no menciona queda intacto.
    expect(sessionRow().transcript).toEqual(SEEDED_TRANSCRIPT);
    expect(sessionRow().client_email).toBe('cliente@ejemplo.test');
  });

  it('refresca updated_at con un instante válido', async () => {
    const before = Date.now();

    await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { status: 'active' },
    });

    const updatedAt = supabase.writes[0].payload.updated_at;
    expect(typeof updatedAt).toBe('string');
    expect(Date.parse(String(updatedAt))).toBeGreaterThanOrEqual(before);
  });

  it('traduce objectionsDetected y closingMode a nombres de columna', async () => {
    const objections = [
      {
        type: 'precio',
        clientMessage: 'Es caro',
        aiResponse: 'Hay financiación',
        resolved: true,
        timestamp: 2,
      },
    ];

    await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { objectionsDetected: objections, closingMode: 'remote' },
    });

    const payload = supabase.writes[0].payload;
    expect(Object.keys(payload).sort()).toEqual([
      'closing_mode',
      'objections_detected',
      'updated_at',
    ]);
    expect(payload.objections_detected).toEqual(objections);
    expect(payload.closing_mode).toBe('remote');
    // Las claves del contrato no llegan a la base tal cual.
    expect(payload.objectionsDetected).toBeUndefined();
    expect(payload.closingMode).toBeUndefined();
  });

  it('escribe closingMode null y clientEmail vacío en lugar de descartarlos', async () => {
    await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { closingMode: null, clientEmail: '' },
    });

    // `null` y `''` son valores que el flujo envía a propósito: tratarlos como
    // "no escribir" perdería la intención del cliente.
    expect(Object.keys(supabase.writes[0].payload).sort()).toEqual([
      'client_email',
      'closing_mode',
      'updated_at',
    ]);
    expect(sessionRow().closing_mode).toBeNull();
    expect(sessionRow().client_email).toBe('');
  });

  it('traduce la transcripción y el teléfono a sus columnas', async () => {
    const transcript = [{ role: 'user' as const, content: 'Me interesa', timestamp: 3 }];

    await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { transcript, clientPhone: '622222222' },
    });

    expect(Object.keys(supabase.writes[0].payload).sort()).toEqual([
      'client_phone',
      'transcript',
      'updated_at',
    ]);
    expect(sessionRow().transcript).toEqual(transcript);
    expect(sessionRow().client_phone).toBe('622222222');
  });
});

describe('updateInfoSession — credencial que no corresponde', () => {
  it('un token ajeno responde unauthorized sin escribir ninguna columna', async () => {
    const result = await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: FOREIGN_TOKEN,
      patch: { status: 'closed_remote', clientEmail: 'atacante@ejemplo.test' },
    });

    expect(result).toEqual({ status: 'unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(sessionRow()).toMatchObject({
      status: 'active',
      client_email: 'cliente@ejemplo.test',
      closing_mode: null,
    });
  });

  it('una sesión inexistente con token válido responde unauthorized', async () => {
    const result = await updateInfoSession({
      sessionId: UNKNOWN_SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { status: 'closed_remote' },
    });

    // Indistinguible del token equivocado a propósito: separarlas diría si un
    // `sessionId` existe.
    expect(result).toEqual({ status: 'unauthorized' });
    expect(supabase.writes).toHaveLength(0);
    expect(sessionRow().status).toBe('active');
  });

  it('el hash guardado no vale como token: la credencial es el token', async () => {
    const result = await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: hashInfoSessionAccessToken(SESSION_TOKEN),
      patch: { status: 'closed_remote' },
    });

    expect(result).toEqual({ status: 'unauthorized' });
    expect(supabase.writes).toHaveLength(0);
  });

  it('no registra el token ni el contenido del patch al rechazar', async () => {
    const warn = vi.spyOn(console, 'warn');

    await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: FOREIGN_TOKEN,
      patch: { clientEmail: 'atacante@ejemplo.test' },
    });

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(FOREIGN_TOKEN);
    expect(logged).not.toContain('atacante@ejemplo.test');
  });

  it('un fallo de escritura responde error y no unauthorized', async () => {
    supabase.updateErrors.set('info_sessions', { message: 'fallo simulado' });

    const result = await updateInfoSession({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
      patch: { status: 'closed_remote' },
    });

    expect(result).toEqual({ status: 'error' });
    expect(sessionRow().status).toBe('active');
  });
});

describe('readInfoSessionState', () => {
  it('devuelve el estado y el aviso al asesor de la sesión acreditada', async () => {
    sessionRow().status = 'completed';
    sessionRow().coach_notified = true;

    const result = await readInfoSessionState({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
    });

    expect(result).toEqual({
      status: 'ok',
      sessionStatus: 'completed',
      coachNotified: true,
    });
  });

  it('trata coach_notified nulo como falso', async () => {
    sessionRow().coach_notified = null;

    const result = await readInfoSessionState({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
    });

    expect(result).toEqual({
      status: 'ok',
      sessionStatus: 'active',
      coachNotified: false,
    });
  });

  it('un token ajeno responde unauthorized sin devolver la fila', async () => {
    const result = await readInfoSessionState({
      sessionId: SESSION_ID,
      accessToken: FOREIGN_TOKEN,
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('una sesión inexistente responde unauthorized', async () => {
    const result = await readInfoSessionState({
      sessionId: UNKNOWN_SESSION_ID,
      accessToken: SESSION_TOKEN,
    });

    expect(result).toEqual({ status: 'unauthorized' });
  });

  it('la lectura no escribe nada', async () => {
    await readInfoSessionState({ sessionId: SESSION_ID, accessToken: SESSION_TOKEN });

    expect(supabase.writes).toHaveLength(0);
  });

  it('un fallo de lectura responde error y no unauthorized', async () => {
    supabase.selectErrors.set('info_sessions', { message: 'fallo simulado' });

    const result = await readInfoSessionState({
      sessionId: SESSION_ID,
      accessToken: SESSION_TOKEN,
    });

    expect(result).toEqual({ status: 'error' });
  });
});
