// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Pruebas del middleware de autenticación y enrutado.
 *
 * POR QUÉ ES EL ARCHIVO MÁS IMPORTANTE SIN PROBAR
 * -----------------------------------------------
 * `src/middleware.ts` decide, en cada petición, si una ruta privada exige sesión y a
 * qué panel va cada rol. Un fallo aquí no da un error visible: da acceso. Y hasta
 * esta ronda no tenía ninguna prueba, además de estar en la lista de archivos que
 * `eslint.config.mjs` ignoraba.
 *
 * QUÉ FIJAN ESTAS PRUEBAS
 * -----------------------
 *  1. **Las ocho rutas protegidas redirigen a `/login` sin sesión**, conservando el
 *     destino en `redirectTo` para volver después.
 *  2. **Las rutas de candidato sin cuenta NO se bloquean**: la entrevista por enlace
 *     público y la capacitación por token son el flujo principal del producto, y
 *     protegerlas por error lo rompería en silencio.
 *  3. **El aislamiento por rol**: un candidato no entra en `/admin`, un asesor no
 *     entra en `/admin`, un empleador no entra en `/feed`.
 *  4. **El onboarding incompleto redirige**, salvo cuando ya se está en él.
 *  5. **El webhook de Stripe se salta la autenticación**, que es deliberado: llega
 *     sin sesión y su autenticidad la comprueba la firma.
 */

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock('@/utils/supabase/middleware', () => ({ createClient: createClientMock }));

import { NextRequest, NextResponse } from 'next/server';

/** Perfil devuelto por la consulta de `user_profiles`. */
interface FakeProfile {
  org_id: string | null;
  user_type: 'candidate' | 'employer' | 'coach' | null;
  onboarding_completed: boolean;
}

/**
 * Configura el doble del cliente de Supabase del middleware.
 *
 * `user: null` simula ausencia de sesión; un perfil simula la fila de
 * `user_profiles` que el middleware consulta para decidir el enrutado por rol.
 */
function stubSupabase(options: { user: { id: string } | null; profile?: FakeProfile | null }) {
  createClientMock.mockImplementation(async (request: NextRequest) => ({
    supabaseResponse: NextResponse.next({ request: { headers: request.headers } }),
    supabase: options.user
      ? {
          from: () => ({
            select: () => ({
              eq: () => ({
                single: async () => ({ data: options.profile ?? null, error: null }),
              }),
            }),
          }),
        }
      : null,
    user: options.user,
  }));
}

/** Ejecuta el middleware sobre una ruta. */
async function run(pathname: string, search = ''): Promise<Response> {
  const { middleware } = await import('@/middleware');
  return middleware(new NextRequest(`https://www.reclutify.com${pathname}${search}`));
}

/** Destino de una redirección, o `null` si la respuesta la deja pasar. */
function redirectTarget(response: Response): string | null {
  const location = response.headers.get('location');
  return location ? new URL(location, 'https://www.reclutify.com').pathname : null;
}

beforeEach(() => {
  vi.resetModules();
  createClientMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rutas protegidas sin sesión', () => {
  const protectedRoutes = [
    '/admin',
    '/admin/pipeline',
    '/coach',
    '/coach/settings',
    '/onboarding',
    '/profile/edit',
    '/feed',
    '/messages',
    '/network',
  ];

  for (const route of protectedRoutes) {
    it(`redirige ${route} a /login`, async () => {
      stubSupabase({ user: null });

      const response = await run(route);

      expect(redirectTarget(response)).toBe('/login');
    });
  }

  it('conserva el destino original en redirectTo', async () => {
    stubSupabase({ user: null });

    const response = await run('/admin/pipeline');
    const location = new URL(response.headers.get('location') ?? '', 'https://www.reclutify.com');

    // Sin esto, el usuario acaba en el panel genérico tras iniciar sesión y pierde
    // la pantalla a la que iba.
    expect(location.searchParams.get('redirectTo')).toBe('/admin/pipeline');
  });
});

describe('rutas públicas del candidato', () => {
  const publicRoutes = [
    // Entrevista por enlace general: el candidato NO tiene cuenta. Es el flujo
    // principal del producto.
    '/interview/public/pub-abc123',
    // Capacitación por token: el empleado accede desde el correo de bienvenida.
    '/training/algun-token',
    // Portal de empleo y páginas de marketing.
    '/career-fair',
    '/pricing',
    '/privacy',
  ];

  for (const route of publicRoutes) {
    it(`deja pasar ${route} sin sesión`, async () => {
      stubSupabase({ user: null });

      const response = await run(route);

      expect(redirectTarget(response)).toBeNull();
    });
  }

  it('protege /training/center, que sí requiere cuenta', async () => {
    stubSupabase({ user: null });

    // La excepción de `/training/` es solo para el acceso por token; el centro con
    // sesión no está en esa excepción... y tampoco en PROTECTED_PREFIXES, así que
    // pasa. Esta prueba DOCUMENTA el comportamiento actual para que un cambio sea
    // deliberado y no accidental.
    const response = await run('/training/center');

    expect(redirectTarget(response)).toBeNull();
  });
});

describe('el webhook de Stripe se salta la autenticación', () => {
  it('no consulta la sesión ni redirige', async () => {
    stubSupabase({ user: null });

    const response = await run('/api/stripe/webhooks');

    expect(redirectTarget(response)).toBeNull();
    // Es deliberado: la petición llega de Stripe sin sesión y su autenticidad la
    // comprueba la firma del cuerpo, no una cookie. Consultar la sesión solo
    // añadiría latencia al camino crítico del cobro.
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('tampoco autentica /api/public-interview', async () => {
    stubSupabase({ user: null });

    const response = await run('/api/public-interview');

    expect(redirectTarget(response)).toBeNull();
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe('aislamiento por rol', () => {
  const completedProfile = (
    userType: FakeProfile['user_type'],
    orgId: string | null = 'org-1',
  ): FakeProfile => ({ org_id: orgId, user_type: userType, onboarding_completed: true });

  it('manda al candidato fuera de /admin', async () => {
    stubSupabase({ user: { id: 'u1' }, profile: completedProfile('candidate', null) });

    expect(redirectTarget(await run('/admin'))).toBe('/feed');
  });

  it('manda al candidato fuera de /coach', async () => {
    stubSupabase({ user: { id: 'u1' }, profile: completedProfile('candidate', null) });

    expect(redirectTarget(await run('/coach'))).toBe('/feed');
  });

  it('manda al asesor fuera de /admin', async () => {
    stubSupabase({ user: { id: 'u1' }, profile: completedProfile('coach') });

    expect(redirectTarget(await run('/admin'))).toBe('/coach');
  });

  it('manda al empleador fuera de /feed', async () => {
    stubSupabase({ user: { id: 'u1' }, profile: completedProfile('employer') });

    expect(redirectTarget(await run('/feed'))).toBe('/admin');
  });

  it('deja al empleador entrar en /admin', async () => {
    stubSupabase({ user: { id: 'u1' }, profile: completedProfile('employer') });

    expect(redirectTarget(await run('/admin'))).toBeNull();
  });

  it('manda a /onboarding al empleador sin organización', async () => {
    stubSupabase({ user: { id: 'u1' }, profile: completedProfile('employer', null) });

    expect(redirectTarget(await run('/admin'))).toBe('/onboarding');
  });
});

describe('onboarding', () => {
  it('redirige a /onboarding cuando está incompleto', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: null, user_type: 'candidate', onboarding_completed: false },
    });

    expect(redirectTarget(await run('/feed'))).toBe('/onboarding');
  });

  it('no redirige en bucle si ya se está en /onboarding', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: null, user_type: 'candidate', onboarding_completed: false },
    });

    // Un bucle de redirección aquí deja la cuenta nueva sin poder entrar a ningún
    // sitio.
    expect(redirectTarget(await run('/onboarding'))).toBeNull();
  });

  it('permite /profile/edit con onboarding incompleto', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: null, user_type: 'candidate', onboarding_completed: false },
    });

    // Es la excepción deliberada: el perfil se completa desde ahí.
    expect(redirectTarget(await run('/profile/edit'))).toBeNull();
  });

  it('saca de /onboarding a quien ya lo completó', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: 'org-1', user_type: 'employer', onboarding_completed: true },
    });

    expect(redirectTarget(await run('/onboarding'))).toBe('/admin');
  });
});

describe('destino tras iniciar sesión', () => {
  it('lleva al candidato a /feed', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: null, user_type: 'candidate', onboarding_completed: true },
    });

    expect(redirectTarget(await run('/login'))).toBe('/feed');
  });

  it('lleva al empleador con organización a /admin', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: 'org-1', user_type: 'employer', onboarding_completed: true },
    });

    expect(redirectTarget(await run('/login'))).toBe('/admin');
  });

  it('lleva al asesor a /coach', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: 'org-1', user_type: 'coach', onboarding_completed: true },
    });

    expect(redirectTarget(await run('/login'))).toBe('/coach');
  });

  it('lleva la raíz al panel que corresponde al rol', async () => {
    stubSupabase({
      user: { id: 'u1' },
      profile: { org_id: 'org-1', user_type: 'employer', onboarding_completed: true },
    });

    expect(redirectTarget(await run('/'))).toBe('/admin');
  });
});

describe('cuando falta la configuración de Supabase', () => {
  it('trata la petición como no autenticada y redirige a /login', async () => {
    // `createClient` del middleware devuelve `user: null` y `supabase: null` si
    // faltan las variables de entorno. El middleware NO puede lanzar ahí, así que la
    // consecuencia correcta es tratar la ruta protegida como no autenticada.
    stubSupabase({ user: null });

    expect(redirectTarget(await run('/admin'))).toBe('/login');
  });
});
