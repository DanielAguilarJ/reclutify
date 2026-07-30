// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Pruebas del cliente de telemetría de `/api/chat`.
 *
 * QUÉ FIJAN
 * ---------
 * La ruta escribía `interview_telemetry` con un cliente construido como
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

import { NextRequest } from 'next/server';

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
  'OPENROUTER_API_KEY',
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
  process.env.OPENROUTER_API_KEY = 'clave-ficticia-de-openrouter';

  // La ruta escribe mucho en el log de depuración; aquí solo estorba.
  vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  createClientMock.mockClear();
  insertMock.mockClear();

  // El aviso se emite UNA VEZ POR PROCESO con una bandera de módulo: sin
  // reiniciar el registro de módulos, la segunda prueba no vería advertencia.
  vi.resetModules();

  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hola, soy Zara. ¿Cuál es tu experiencia con React?' } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
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

  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Texto de todas las advertencias emitidas, concatenado. */
const warnings = (): string =>
  warnSpy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')).join('\n');

/** Primer turno de una entrevista: es el caso que sí registra telemetría. */
function chatRequest(): NextRequest {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentTopic: 'React',
      allTopics: [{ label: 'React', status: 'current', rubric: { weight: 5 } }],
      recentMessages: [],
      language: 'es',
      roleTitle: 'Desarrolladora Frontend',
      roleDescription: 'Puesto ficticio para la prueba',
      isLastTopic: false,
      interviewDuration: 30,
      candidateName: 'Candidata Ficticia',
      sessionId: 'sesion-de-prueba',
    }),
  });
}

async function postChat(): Promise<Response> {
  const { POST } = await import('@/app/api/chat/route');
  return POST(chatRequest());
}

describe('/api/chat exige la clave de servicio para la telemetría', () => {
  it('registra con SUPABASE_SERVICE_ROLE_KEY y sin advertencias', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SECRET_KEY;

    const response = await postChat();
    expect(response.status).toBe(200);

    // La escritura es «fire-and-forget»: no la espera la respuesta al candidato.
    await vi.waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));

    expect(createClientMock).toHaveBeenCalledWith(FAKE_URL, FAKE_SECRET_KEY, expect.anything());
    expect(insertMock.mock.calls[0][0]).toMatchObject({ session_id: 'sesion-de-prueba' });
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('/api/chat nunca recurre a la clave anon para la telemetría', () => {
  it('omite el registro cuando falta la clave de servicio y responde igual', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await postChat();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining('Zara'),
    });

    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));

    // Lo esencial: ni un cliente, así que ni un intento con la clave pública.
    expect(createClientMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();

    const logged = warnings();
    expect(logged).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(logged).not.toContain(FAKE_ANON_KEY);
  });

  it('advierte una sola vez por proceso, no en cada turno', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await postChat();
    await postChat();

    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('trata la clave anon pegada en la variable del servicio como ausencia', async () => {
    // Con el `||` anterior este caso NI SIQUIERA activaba el respaldo: construía
    // un cliente inservible y cada inserción moría con `401 Invalid API key`.
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_ANON_JWT;

    const response = await postChat();
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalledTimes(1));
    expect(createClientMock).not.toHaveBeenCalled();

    const logged = warnings();
    expect(logged).toMatch(/anon/i);
    expect(logged).toMatch(/RLS/);
    // El valor configurado nunca se registra, ni un fragmento.
    expect(logged).not.toContain(FAKE_ANON_JWT.slice(0, 12));
  });
});
