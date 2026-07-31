// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar el módulo.
vi.mock('server-only', () => ({}));

/**
 * Pruebas del cliente de telemetría de la entrevista.
 *
 * QUÉ FIJAN
 * ---------
 * `/api/chat` escribía `interview_telemetry` con un cliente construido como
 * `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY`. Ese respaldo era
 * la ÚNICA razón por la que la tabla necesitaba la política de inserción abierta
 * `Enable insert for all users` (`WITH CHECK (true)`), porque la clave anon viaja
 * al navegador. Estas pruebas fallan si alguien reintroduce el respaldo, y son la
 * precondición de
 * `supabase/migrations/202608010006_drop_permissive_insert_policies.sql`.
 *
 * Y fijan la otra mitad del contrato, que es de producto: sin clave de servicio
 * la entrevista SIGUE respondiendo con normalidad. La telemetría es material de
 * depuración; no puede tumbar una entrevista.
 *
 * POR QUÉ AHORA APUNTAN AL MÓDULO Y NO A LA RUTA
 * ----------------------------------------------
 * La lógica vivía dentro de `/api/chat/route.ts`, así que la única forma de
 * probarla era ejecutar la ruta completa: había que simular OpenRouter y, desde
 * que la ruta exige credencial de entrevista, también toda la autorización. Eso
 * hacía que una prueba sobre la FORMA DE LA CLAVE dependiera de media docena de
 * piezas que no tienen nada que ver.
 *
 * Ahora la lógica está en `src/lib/interview/telemetry.ts` y se prueba
 * directamente. Las aserciones son las mismas; lo que desaparece es el andamio.
 * La autorización de `/api/chat` se prueba aparte, en `api/chat-authorization.test.ts`.
 *
 * TODAS LAS CLAVES DE ESTE ARCHIVO SON FICTICIAS. El JWT se construye aquí
 * mismo, así que su firma es relleno: el código solo mira la forma.
 */

const { createClientMock, insertMock } = vi.hoisted(() => {
  type TelemetryRow = Record<string, unknown>;

  const insertMock = vi.fn<(row: TelemetryRow) => Promise<{ error: null }>>(
    async () => ({ error: null }),
  );

  const createClientMock = vi.fn<
    (url: string, key: string, options?: unknown) => {
      from: (table: string) => { insert: typeof insertMock };
    }
  >(() => ({ from: () => ({ insert: insertMock }) }));

  return { createClientMock, insertMock };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: createClientMock }));

const FAKE_SECRET_KEY = 'sb_secret_EJEMPLO-FICTICIO-NO-ES-UNA-CLAVE-REAL';
const FAKE_ANON_KEY = 'sb_publishable_EJEMPLO-FICTICIO-ANON';
const FAKE_URL = 'https://proyecto-ficticio.supabase.co';

const FAKE_ANON_JWT = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'supabase', role: 'anon' }), 'utf8').toString('base64url'),
  'ZmlybWEtZmljdGljaWEtbm8tdmVyaWZpY2E',
].join('.');

const ENV_KEYS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
] as const;

let originalEnv: Record<string, string | undefined> = {};
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL = FAKE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;

  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  createClientMock.mockClear();
  insertMock.mockClear();

  // El aviso se emite UNA VEZ POR PROCESO con una bandera de módulo: sin
  // reiniciar el registro de módulos, la segunda prueba no vería advertencia.
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  vi.restoreAllMocks();
});

/** Texto de todas las advertencias emitidas, concatenado. */
const warnings = (): string =>
  warnSpy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')).join('\n');

/** Un turno cualquiera: lo que importa es la clave, no el contenido. */
const turn = {
  sessionId: 'sesion-de-prueba',
  candidateName: 'Candidata Ficticia',
  roleTitle: 'Desarrolladora Frontend',
  turnIndex: 1,
  model: 'modelo-ficticio',
  responseText: 'Hola, soy Zara.',
  orgId: 'org-de-prueba',
};

async function logTurn(): Promise<boolean> {
  const { logInterviewTurn } = await import('@/lib/interview/telemetry');
  return logInterviewTurn(turn);
}

describe('la telemetría exige la clave de servicio', () => {
  it('registra con SUPABASE_SERVICE_ROLE_KEY y sin advertencias', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SECRET_KEY;

    await expect(logTurn()).resolves.toBe(true);

    expect(createClientMock).toHaveBeenCalledWith(FAKE_URL, FAKE_SECRET_KEY, expect.anything());
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toMatchObject({ session_id: 'sesion-de-prueba' });
    // La organización tiene que llegar a la fila: es lo único que permite que `/admin/telemetry`
    // enseñe lo suyo y solo lo suyo, ahora que la tabla no tiene políticas de lectura.
    expect(insertMock.mock.calls[0][0]).toMatchObject({ org_id: 'org-de-prueba' });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('la telemetría nunca recurre a la clave anon', () => {
  it('omite el registro cuando falta la clave de servicio, sin lanzar', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    // `false` significa «no se registró». Lo que NO puede hacer es lanzar: el
    // llamante es un turno de entrevista en curso.
    await expect(logTurn()).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Lo esencial: ni un cliente, así que ni un intento con la clave pública.
    expect(createClientMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();

    const logged = warnings();
    expect(logged).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(logged).not.toContain(FAKE_ANON_KEY);
  });

  it('advierte una sola vez por proceso, no en cada turno', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await logTurn();
    await logTurn();
    await logTurn();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('trata la clave anon pegada en la variable del servicio como ausencia', async () => {
    // Con el `||` anterior este caso NI SIQUIERA activaba el respaldo: construía
    // un cliente inservible y cada inserción moría con `401 Invalid API key`.
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_ANON_JWT;

    await expect(logTurn()).resolves.toBe(false);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(createClientMock).not.toHaveBeenCalled();

    const logged = warnings();
    expect(logged).toMatch(/anon/i);
    expect(logged).toMatch(/RLS/);
    // El valor configurado nunca se registra, ni un fragmento.
    expect(logged).not.toContain(FAKE_ANON_JWT.slice(0, 12));
  });

  it('no registra nada cuando el turno no trae sessionId', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SECRET_KEY;

    const { logInterviewTurn } = await import('@/lib/interview/telemetry');

    // Sin `sessionId` no hay nada que correlacionar, así que se omite antes de
    // construir el cliente. Es el comportamiento que ya tenía la ruta.
    await expect(logInterviewTurn({ ...turn, sessionId: '' })).resolves.toBe(false);

    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe('summarizeChatPayload no filtra datos personales', () => {
  it('sustituye el CV por indicadores de presencia', async () => {
    const { summarizeChatPayload } = await import('@/lib/interview/telemetry');

    const summary = summarizeChatPayload({
      roleId: 'rol-1',
      currentTopic: 'React',
      currentTopicIndex: 0,
      topicCount: 3,
      messageCount: 4,
      interviewMode: 'restricted',
      language: 'es',
      interviewDuration: 30,
      timerSeconds: 120,
      hasCv: true,
      cvExperienceCount: 2,
      cvSkillCount: 7,
      promptChars: 4321,
    });

    // El resumen dice QUE hay CV y cuánto, nunca su contenido. Antes se guardaba
    // `{ ...rawBody }`, es decir el CV completo del candidato, en una tabla que
    // cualquier cuenta autenticada podía leer.
    expect(summary.cv).toEqual({ present: true, experienceEntries: 2, skills: 7 });

    // La firma de la función es la garantía real: solo acepta contadores y
    // banderas, así que no existe forma de que el contenido del CV o la
    // transcripción entren en el resumen. Se comprueba que las claves del objeto
    // son exactamente las esperadas, de modo que añadir un campo con datos
    // personales rompa esta prueba.
    expect(Object.keys(summary).sort()).toEqual(
      [
        '_redacted',
        'currentTopic',
        'currentTopicIndex',
        'cv',
        'interviewDuration',
        'interviewMode',
        'language',
        'messageCount',
        'promptChars',
        'roleId',
        'timerSeconds',
        'topicCount',
      ].sort(),
    );
  });
});
