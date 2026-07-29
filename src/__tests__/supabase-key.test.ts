// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar `admin.ts`.
vi.mock('server-only', () => ({}));

import { classifySupabaseKeyShape, isServiceRoleKeyShape } from '@/lib/supabase-key';

/**
 * Pruebas del validador de forma de claves de Supabase y de su uso en
 * `createAdminClient`.
 *
 * TODOS LOS VALORES SON FICTICIOS Y EVIDENTEMENTE FALSOS. Ninguna clave real
 * puede entrar en este archivo: quedaría en el historial de git para siempre.
 * Los JWT se construyen aquí mismo a partir de un payload literal, así que su
 * firma es texto de relleno y no verifica nada, que es exactamente el punto: el
 * validador solo mira la forma.
 */

/** Segmento de firma de relleno: base64url válido, criptográficamente inútil. */
const FAKE_SIGNATURE = 'ZmlybWEtZmljdGljaWEtbm8tdmVyaWZpY2E';

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Construye un JWT de tres segmentos con el payload indicado. */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  return `${header}.${toBase64Url(JSON.stringify(payload))}.${FAKE_SIGNATURE}`;
}

const FAKE_SERVICE_ROLE_JWT = fakeJwt({
  iss: 'supabase',
  ref: 'proyecto-ficticio',
  role: 'service_role',
  iat: 1,
  exp: 2,
});

const FAKE_ANON_JWT = fakeJwt({
  iss: 'supabase',
  ref: 'proyecto-ficticio',
  role: 'anon',
  iat: 1,
  exp: 2,
});

const FAKE_SECRET_KEY = 'sb_secret_EJEMPLO-FICTICIO-NO-ES-UNA-CLAVE-REAL';

describe('isServiceRoleKeyShape accepts the two valid shapes', () => {
  it('accepts a legacy JWT whose payload declares role service_role', () => {
    expect(isServiceRoleKeyShape(FAKE_SERVICE_ROLE_JWT)).toBe(true);
    expect(classifySupabaseKeyShape(FAKE_SERVICE_ROLE_JWT)).toBe('service-role');
  });

  it('accepts a modern sb_secret_ key with enough material', () => {
    expect(isServiceRoleKeyShape(FAKE_SECRET_KEY)).toBe(true);
    expect(classifySupabaseKeyShape(FAKE_SECRET_KEY)).toBe('service-role');
  });

  it('tolerates surrounding whitespace from a sloppy copy-paste', () => {
    expect(isServiceRoleKeyShape(`  ${FAKE_SECRET_KEY}\n`)).toBe(true);
  });
});

describe('isServiceRoleKeyShape rejects the dangerous mistakes', () => {
  it('rejects the literal role name service_role', () => {
    // El fallo que originó este validador: el NOMBRE de la fila del panel
    // pegado como si fuera su VALOR.
    expect(isServiceRoleKeyShape('service_role')).toBe(false);
    expect(classifySupabaseKeyShape('service_role')).toBe('unrecognized');
  });

  it('rejects the empty string and whitespace-only values', () => {
    expect(isServiceRoleKeyShape('')).toBe(false);
    expect(classifySupabaseKeyShape('')).toBe('missing');
    expect(isServiceRoleKeyShape('   \t ')).toBe(false);
    expect(classifySupabaseKeyShape('   \t ')).toBe('missing');
  });

  it('rejects the anon key even though it is a well-formed JWT', () => {
    // El caso más peligroso: la clave anon pasaría cualquier validación laxa
    // basada solo en "tiene tres segmentos", y luego fallaría de forma
    // intermitente porque no puede saltarse RLS.
    expect(isServiceRoleKeyShape(FAKE_ANON_JWT)).toBe(false);
    expect(classifySupabaseKeyShape(FAKE_ANON_JWT)).toBe('anon');
  });

  it('classifies a publishable key as the anon mistake too', () => {
    expect(classifySupabaseKeyShape('sb_publishable_EJEMPLO-FICTICIO')).toBe('anon');
  });

  it('rejects a JWT carrying any other role', () => {
    expect(isServiceRoleKeyShape(fakeJwt({ role: 'authenticated' }))).toBe(false);
  });

  it('rejects an sb_secret_ placeholder with no real material', () => {
    expect(isServiceRoleKeyShape('sb_secret_')).toBe(false);
    expect(isServiceRoleKeyShape('sb_secret_TODO')).toBe(false);
  });
});

describe('classifySupabaseKeyShape decodes defensively', () => {
  it('returns false instead of throwing on a malformed base64url payload', () => {
    const malformed = `${toBase64Url('{}')}.no*es*base64url!.${FAKE_SIGNATURE}`;
    expect(() => isServiceRoleKeyShape(malformed)).not.toThrow();
    expect(isServiceRoleKeyShape(malformed)).toBe(false);
  });

  it('returns false instead of throwing on a payload that is not JSON', () => {
    const notJson = `${toBase64Url('{}')}.${toBase64Url('no soy json {')}.${FAKE_SIGNATURE}`;
    expect(() => isServiceRoleKeyShape(notJson)).not.toThrow();
    expect(isServiceRoleKeyShape(notJson)).toBe(false);
  });

  it('returns false on JSON that is valid but not an object with a string role', () => {
    const cases = [
      `${toBase64Url('{}')}.${toBase64Url('"solo-texto"')}.${FAKE_SIGNATURE}`,
      `${toBase64Url('{}')}.${toBase64Url('[1,2,3]')}.${FAKE_SIGNATURE}`,
      `${toBase64Url('{}')}.${toBase64Url('null')}.${FAKE_SIGNATURE}`,
      `${toBase64Url('{}')}.${toBase64Url('{"sub":"sin-role"}')}.${FAKE_SIGNATURE}`,
      `${toBase64Url('{}')}.${toBase64Url('{"role":123}')}.${FAKE_SIGNATURE}`,
    ];

    for (const candidate of cases) {
      expect(() => isServiceRoleKeyShape(candidate)).not.toThrow();
      expect(isServiceRoleKeyShape(candidate)).toBe(false);
    }
  });

  it('returns missing for non-string values without throwing', () => {
    expect(classifySupabaseKeyShape(undefined)).toBe('missing');
    expect(classifySupabaseKeyShape(null)).toBe('missing');
    expect(classifySupabaseKeyShape(42)).toBe('missing');
    expect(classifySupabaseKeyShape({ role: 'service_role' })).toBe('missing');
  });

  it('returns unrecognized for a JWT with the wrong number of segments', () => {
    expect(classifySupabaseKeyShape(`${toBase64Url('{"role":"service_role"}')}`)).toBe(
      'unrecognized',
    );
    expect(classifySupabaseKeyShape(`a.${toBase64Url('{"role":"service_role"}')}`)).toBe(
      'unrecognized',
    );
    expect(classifySupabaseKeyShape(`.${toBase64Url('{"role":"service_role"}')}.`)).toBe(
      'unrecognized',
    );
  });
});

// ============================================================
// createAdminClient: el guardarraíl en su punto de uso
// ============================================================

const createClientMock = vi.fn(() => ({ marcador: 'cliente-ficticio' }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...(args as [])),
}));

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

let originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  createClientMock.mockClear();
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto-ficticio.supabase.co';
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
});

async function loadCreateAdminClient() {
  const { createAdminClient } = await import('@/utils/supabase/admin');
  return createAdminClient;
}

describe('createAdminClient rejects a misconfigured key', () => {
  it('throws for a value that is not a service role key', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role';
    const createAdminClient = await loadCreateAdminClient();

    expect(() => createAdminClient()).toThrow(/service role key/i);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('never leaks the configured value in the error message', async () => {
    // Valor deliberadamente distinto de cualquier palabra del mensaje, para que
    // la aserción detecte una filtración real y no una coincidencia de texto.
    const junk = 'valor-basura-ficticio-1234567890';
    process.env.SUPABASE_SERVICE_ROLE_KEY = junk;
    const createAdminClient = await loadCreateAdminClient();

    let thrown: unknown;
    try {
      createAdminClient();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).not.toContain(junk);
    expect(message).not.toContain(junk.slice(0, 8));
    expect(message).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('gives the anon key its own message about not bypassing RLS', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_ANON_JWT;
    const createAdminClient = await loadCreateAdminClient();

    let thrown: unknown;
    try {
      createAdminClient();
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    const message = (thrown as Error).message;
    expect(message).toMatch(/anon/i);
    expect(message).toMatch(/RLS/);
    expect(message).not.toContain(FAKE_ANON_JWT);
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('still reports the plain missing case separately', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const createAdminClient = await loadCreateAdminClient();

    expect(() => createAdminClient()).toThrow('SUPABASE_SERVICE_ROLE_KEY is not configured');
  });
});

describe('createAdminClient accepts a well-shaped key', () => {
  it('builds the client for a modern secret key', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SECRET_KEY;
    const createAdminClient = await loadCreateAdminClient();

    expect(() => createAdminClient()).not.toThrow();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('builds the client for a legacy service_role JWT', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_ROLE_JWT;
    const createAdminClient = await loadCreateAdminClient();

    expect(() => createAdminClient()).not.toThrow();
    expect(createClientMock).toHaveBeenCalledTimes(1);
  });
});
