// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Pruebas del limitador de tasa.
 *
 * QUÉ FIJAN
 * ---------
 * Antes de esta ronda NINGÚN endpoint del proyecto tenía tope de tasa, y los que
 * llaman a OpenRouter facturan por token. Estas pruebas fijan las tres propiedades
 * de las que depende esa protección:
 *
 *  1. **Cuenta y corta.** La petición número `limit + 1` de una ventana se
 *     rechaza, y el `Retry-After` que se devuelve es coherente.
 *  2. **Los contadores están aislados.** Dos identificadores distintos, o dos
 *     endpoints distintos, no comparten cuota. Si compartieran, un usuario podría
 *     agotar la cuota de otro (denegación de servicio dirigida).
 *  3. **No tumba la aplicación cuando la base falla.** Cae al contador en memoria
 *     y avisa una vez. Es la decisión documentada en el módulo: una entrevista
 *     interrumpida a mitad no se recupera, así que el limitador no puede ser el
 *     que la interrumpa.
 *
 * El identificador se comprueba además como HASH: la tabla no debe guardar
 * direcciones IP en claro.
 */

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

/** Petición mínima con la cabecera del proxy. */
function requestFrom(ip: string): Request {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
  });
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules();
  rpcMock.mockReset();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  process.env.RATE_LIMIT_SALT = 'sal-ficticia-de-prueba';

  const { __resetInMemoryRateLimits } = await import('@/lib/api/rate-limit');
  __resetInMemoryRateLimits();
});

afterEach(() => {
  delete process.env.RATE_LIMIT_SALT;
  vi.restoreAllMocks();
});

describe('identificador de cuota', () => {
  it('no contiene la IP en claro', async () => {
    const { rateLimitIdentifier, resolveClientIp } = await import('@/lib/api/rate-limit');

    const ip = '203.0.113.42';
    const request = requestFrom(ip);

    expect(resolveClientIp(request)).toBe(ip);

    const identifier = rateLimitIdentifier(request, null);

    // La tabla `api_rate_limits` es material operativo para acotar el gasto, no un
    // registro de visitantes: guardar IPs sin necesidad sería recoger un dato
    // personal que no hace falta.
    expect(identifier).not.toContain(ip);
    expect(identifier).toMatch(/^[0-9a-f]{32}$/);
  });

  it('prefiere el usuario autenticado sobre la IP', async () => {
    const { rateLimitIdentifier } = await import('@/lib/api/rate-limit');

    const request = requestFrom('203.0.113.42');

    // Dos usuarios detrás del MISMO NAT corporativo no deben compartir cuota.
    const userA = rateLimitIdentifier(request, 'usuario-a');
    const userB = rateLimitIdentifier(request, 'usuario-b');
    const anonymous = rateLimitIdentifier(request, null);

    expect(userA).not.toBe(userB);
    expect(userA).not.toBe(anonymous);
  });

  it('toma el primer elemento de x-forwarded-for', async () => {
    const { resolveClientIp } = await import('@/lib/api/rate-limit');

    // La cadena la construye el proxy añadiendo por la derecha, así que el cliente
    // real es el primero.
    const request = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.42, 10.0.0.1, 10.0.0.2' },
    });

    expect(resolveClientIp(request)).toBe('203.0.113.42');
  });

  it('agrupa las peticiones sin IP identificable en un único contador', async () => {
    const { resolveClientIp } = await import('@/lib/api/rate-limit');

    // Agrupar es más seguro que dejarlas sin tope.
    expect(resolveClientIp(new Request('http://localhost/'))).toBe('unknown');
  });
});

describe('consumo contra la base de datos', () => {
  it('permite mientras haya cuota y llama a la RPC con los parámetros del tope', async () => {
    rpcMock.mockResolvedValue({
      data: [{ allowed: true, remaining: 59, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    });

    const { enforceRateLimit, RATE_LIMITS } = await import('@/lib/api/rate-limit');

    const result = await enforceRateLimit(requestFrom('203.0.113.1'), RATE_LIMITS.AI_CHAT, 'usuario-1');

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(59);

    expect(rpcMock).toHaveBeenCalledWith(
      'consume_rate_limit',
      expect.objectContaining({
        p_bucket: 'ai-chat',
        p_limit: RATE_LIMITS.AI_CHAT.limit,
        p_window_seconds: RATE_LIMITS.AI_CHAT.windowSeconds,
      }),
    );
  });

  it('lanza 429 con Retry-After cuando la cuota está agotada', async () => {
    const resetAt = new Date(Date.now() + 45_000);
    rpcMock.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, reset_at: resetAt.toISOString() }],
      error: null,
    });

    const { enforceRateLimit, RATE_LIMITS } = await import('@/lib/api/rate-limit');
    const { ApiError } = await import('@/lib/api/errors');

    const call = enforceRateLimit(requestFrom('203.0.113.1'), RATE_LIMITS.AI_CHAT, 'usuario-1');

    await expect(call).rejects.toBeInstanceOf(ApiError);
    await expect(call).rejects.toMatchObject({ status: 429, code: 'rate_limited' });

    // El mensaje dice CUÁNTO esperar: un 429 sin ese dato obliga al cliente a
    // adivinar y a reintentar en bucle.
    await expect(call).rejects.toThrow(/Try again in \d+ second/);
  });

  it('aísla los contadores por endpoint', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, remaining: 1, reset_at: null }], error: null });

    const { enforceRateLimit, RATE_LIMITS } = await import('@/lib/api/rate-limit');

    const request = requestFrom('203.0.113.1');
    await enforceRateLimit(request, RATE_LIMITS.AI_CHAT, 'usuario-1');
    await enforceRateLimit(request, RATE_LIMITS.AI_TTS, 'usuario-1');

    const buckets = rpcMock.mock.calls.map((call) => call[1].p_bucket);

    // Un turno de entrevista no debe consumir la cuota de la síntesis de voz.
    expect(buckets).toEqual(['ai-chat', 'ai-tts']);
  });
});

describe('degradación cuando la base no responde', () => {
  it('cae al contador en memoria, avisa una vez y sigue contando', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });

    const { consumeRateLimit } = await import('@/lib/api/rate-limit');

    const rule = { bucket: 'prueba', limit: 2, windowSeconds: 60 };

    // El respaldo NO es «permitir todo»: sigue acotando la ráfaga por instancia,
    // que es lo que frena un bucle desde un solo origen.
    const first = await consumeRateLimit(rule, 'identificador-1');
    const second = await consumeRateLimit(rule, 'identificador-1');
    const third = await consumeRateLimit(rule, 'identificador-1');

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);

    // Una sola advertencia por proceso: el motivo es de infraestructura, no de la
    // petición, y repetirla en cada turno llenaría el log.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain('consume_rate_limit');
  });

  it('el respaldo en memoria también aísla por identificador', async () => {
    rpcMock.mockRejectedValue(new Error('sin conexión'));

    const { consumeRateLimit } = await import('@/lib/api/rate-limit');

    const rule = { bucket: 'prueba', limit: 1, windowSeconds: 60 };

    await consumeRateLimit(rule, 'identificador-1');
    const otherSubject = await consumeRateLimit(rule, 'identificador-2');

    // Si compartieran contador, agotar la cuota de otro usuario sería trivial.
    expect(otherSubject.allowed).toBe(true);
  });
});

describe('cabeceras de cuota', () => {
  it('expone límite, restante, reinicio y Retry-After', async () => {
    const { rateLimitHeaders } = await import('@/lib/api/rate-limit');

    const resetAt = new Date(Date.now() + 30_000);
    const headers = rateLimitHeaders({ allowed: false, remaining: 0, resetAt, limit: 60 });

    expect(headers['X-RateLimit-Limit']).toBe('60');
    expect(headers['X-RateLimit-Remaining']).toBe('0');
    expect(Number(headers['Retry-After'])).toBeGreaterThan(0);
    expect(Number(headers['Retry-After'])).toBeLessThanOrEqual(30);
  });
});
