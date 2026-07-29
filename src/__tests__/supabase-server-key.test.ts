// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar el módulo.
vi.mock('server-only', () => ({}));

import { resolveSupabaseServerKey } from '@/lib/supabase-server-key';

/**
 * Pruebas de la resolución de clave para las rutas que DEGRADAN.
 *
 * TODOS LOS VALORES SON FICTICIOS Y EVIDENTEMENTE FALSOS. Ninguna clave real
 * puede entrar en este archivo: quedaría en el historial de git para siempre.
 * El JWT se construye aquí mismo, así que su firma es relleno y no verifica
 * nada; el resolutor solo mira la forma.
 */

const FAKE_SECRET_KEY = 'sb_secret_EJEMPLO-FICTICIO-NO-ES-UNA-CLAVE-REAL';
const FAKE_ANON_KEY = 'sb_publishable_EJEMPLO-FICTICIO-ANON';

const FAKE_ANON_JWT = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'supabase', role: 'anon' }), 'utf8').toString('base64url'),
  'ZmlybWEtZmljdGljaWEtbm8tdmVyaWZpY2E',
].join('.');

const ENV_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;

const CONTEXT = 'pruebas/resolutor';

let originalEnv: Record<string, string | undefined> = {};
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }

  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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

  warnSpy.mockRestore();
});

/** Texto de todas las advertencias emitidas, concatenado. */
const warnings = (): string =>
  warnSpy.mock.calls.map((call: unknown[]) => call.map(String).join(' ')).join('\n');

describe('resolveSupabaseServerKey prefers a well-shaped service role key', () => {
  it('returns the service role key and stays quiet', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SECRET_KEY;

    expect(resolveSupabaseServerKey(CONTEXT)).toBe(FAKE_SECRET_KEY);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('trims whitespace dragged in by a sloppy copy-paste', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = `  ${FAKE_SECRET_KEY}\n`;

    expect(resolveSupabaseServerKey(CONTEXT)).toBe(FAKE_SECRET_KEY);
  });
});

describe('resolveSupabaseServerKey falls back to the anon key', () => {
  it('falls back when the service role variable is absent, without noise', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    expect(resolveSupabaseServerKey(CONTEXT)).toBe(FAKE_ANON_KEY);
    // La ausencia es la configuración degradada esperada y ya la reporta el
    // diagnóstico; no se advierte en cada petición.
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('falls back when the variable is set but not shaped like a service key', () => {
    // El fallo que este helper existe para delatar: con `||` el respaldo NO se
    // activaba y la ruta construía un cliente inservible.
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role';

    expect(resolveSupabaseServerKey(CONTEXT)).toBe(FAKE_ANON_KEY);
    expect(warnSpy).toHaveBeenCalledTimes(1);

    const logged = warnings();
    expect(logged).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(logged).toContain(CONTEXT);
  });

  it('says explicitly when the variable holds the anon key', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_ANON_JWT;

    expect(resolveSupabaseServerKey(CONTEXT)).toBe(FAKE_ANON_KEY);

    const logged = warnings();
    expect(logged).toMatch(/anon/i);
    expect(logged).toMatch(/RLS/);
  });

  it('never logs the configured value, not even a fragment', () => {
    // Valor deliberadamente distinto de cualquier palabra del mensaje, para que
    // la aserción detecte una filtración real y no una coincidencia de texto.
    const junk = 'valor-basura-ficticio-1234567890';
    process.env.SUPABASE_SERVICE_ROLE_KEY = junk;

    expect(resolveSupabaseServerKey(CONTEXT)).toBe(FAKE_ANON_KEY);

    const logged = warnings();
    expect(logged).not.toContain(junk);
    expect(logged).not.toContain(junk.slice(0, 8));
    expect(logged).not.toContain(String(junk.length));
  });
});

describe('resolveSupabaseServerKey reports that nothing is usable', () => {
  it('returns null when neither key is configured', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(resolveSupabaseServerKey(CONTEXT)).toBeNull();
  });

  it('treats a whitespace-only anon key as absent', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = '   \t ';

    expect(resolveSupabaseServerKey(CONTEXT)).toBeNull();
  });
});
