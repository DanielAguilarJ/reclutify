// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { resolveAppBaseUrl, requireAppBaseUrl } from '@/lib/app-url';

/**
 * Pruebas del resolvedor de URL base pública.
 *
 * Todo el estado que lee el resolvedor vive en `process.env`, así que cada
 * prueba parte de un entorno limpio y el original se restaura al terminar. Esto
 * no es cosmético: `src/__tests__/training/prompts.test.ts` escribe
 * `NEXT_PUBLIC_APP_URL`, y dejar residuo aquí (o heredarlo) haría que estas
 * pruebas midan el entorno de otra suite en vez del caso que declaran.
 */

const ENV_KEYS = [
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_URL',
  'NODE_ENV',
  'PORT',
] as const;

let originalEnv: Record<string, string | undefined> = {};

function clearEnvKey(key: string): void {
  delete process.env[key];
}

function setEnvKey(key: string, value: string): void {
  process.env[key] = value;
}

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    clearEnvKey(key);
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      clearEnvKey(key);
    } else {
      setEnvKey(key, value);
    }
  }
});

describe('resolveAppBaseUrl precedence', () => {
  it('prefers a valid NEXT_PUBLIC_APP_URL over the platform variables', () => {
    setEnvKey('NEXT_PUBLIC_APP_URL', 'https://app.reclutify.com');
    setEnvKey('VERCEL_PROJECT_PRODUCTION_URL', 'produccion.vercel.app');
    setEnvKey('VERCEL_URL', 'despliegue.vercel.app');

    expect(resolveAppBaseUrl()).toBe('https://app.reclutify.com');
  });

  it.each([
    ['not-a-url'],
    ['/training'],
    ['app.reclutify.com'],
    ['ftp://app.reclutify.com'],
    ['   '],
  ])('ignores the junk value %j and falls through to the next source', (junk) => {
    setEnvKey('NEXT_PUBLIC_APP_URL', junk);
    setEnvKey('VERCEL_PROJECT_PRODUCTION_URL', 'produccion.vercel.app');

    expect(resolveAppBaseUrl()).toBe('https://produccion.vercel.app');
  });

  it('prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL', () => {
    setEnvKey('VERCEL_PROJECT_PRODUCTION_URL', 'produccion.vercel.app');
    setEnvKey('VERCEL_URL', 'despliegue-efimero.vercel.app');

    expect(resolveAppBaseUrl()).toBe('https://produccion.vercel.app');
  });

  it('prefixes https:// on both platform variables', () => {
    setEnvKey('VERCEL_PROJECT_PRODUCTION_URL', 'produccion.vercel.app');
    expect(resolveAppBaseUrl()).toBe('https://produccion.vercel.app');

    clearEnvKey('VERCEL_PROJECT_PRODUCTION_URL');
    setEnvKey('VERCEL_URL', 'despliegue.vercel.app');
    expect(resolveAppBaseUrl()).toBe('https://despliegue.vercel.app');
  });
});

describe('resolveAppBaseUrl normalization', () => {
  it('strips the trailing slash from an explicit URL', () => {
    setEnvKey('NEXT_PUBLIC_APP_URL', 'https://app.reclutify.com/');
    expect(resolveAppBaseUrl()).toBe('https://app.reclutify.com');
  });

  it('strips the trailing slash from a platform variable', () => {
    setEnvKey('VERCEL_URL', 'despliegue.vercel.app/');
    expect(resolveAppBaseUrl()).toBe('https://despliegue.vercel.app');
  });

  it('keeps a configured subpath deployment intact', () => {
    setEnvKey('NEXT_PUBLIC_APP_URL', 'https://reclutify.com/app/');
    expect(resolveAppBaseUrl()).toBe('https://reclutify.com/app');
  });
});

describe('resolveAppBaseUrl in production without configuration', () => {
  beforeEach(() => {
    setEnvKey('NODE_ENV', 'production');
  });

  it('returns null instead of falling back to localhost', () => {
    expect(resolveAppBaseUrl()).toBeNull();
  });

  it('makes requireAppBaseUrl throw an actionable error', () => {
    expect(() => requireAppBaseUrl()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});

describe('resolveAppBaseUrl outside production', () => {
  it('falls back to localhost on the default port', () => {
    setEnvKey('NODE_ENV', 'development');
    expect(resolveAppBaseUrl()).toBe('http://localhost:3000');
  });

  it('honors PORT in the localhost fallback', () => {
    setEnvKey('NODE_ENV', 'development');
    setEnvKey('PORT', '4321');
    expect(resolveAppBaseUrl()).toBe('http://localhost:4321');
  });

  it('returns the resolved fallback from requireAppBaseUrl without throwing', () => {
    setEnvKey('NODE_ENV', 'test');
    expect(requireAppBaseUrl()).toBe('http://localhost:3000');
  });
});
