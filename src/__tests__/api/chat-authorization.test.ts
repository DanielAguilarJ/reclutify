// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * Pruebas de autorización de `/api/chat`.
 *
 * QUÉ FIJAN
 * ---------
 * `/api/chat` es el endpoint que conduce la entrevista y el que más cuesta: envía el
 * prompt completo —rúbrica, CV y todo el historial— a un modelo que factura por
 * token, en CADA turno. No exigía nada: ni sesión, ni credencial, ni validación, ni
 * tope de tasa. Un bucle de `curl` de una línea agotaba el saldo de OpenRouter.
 *
 * Estas pruebas fijan las cuatro puertas, en el orden en que deben abrirse:
 *
 *  1. Validación de forma (`400`) — antes `POST {}` devolvía `500`.
 *  2. Credencial ausente o inválida (`401`).
 *  3. Credencial válida para OTRA vacante (`403`).
 *  4. Credencial válida → se llama al modelo.
 *
 * Y fijan lo que NO debe pasar en los tres primeros casos: **ni una llamada a
 * OpenRouter**. Ese es el punto de todo el cambio; si un rechazo llegara a gastar un
 * token, la protección no serviría.
 */

const { requireCredentialMock, authorizeForRoleMock, rpcMock, fetchMock } = vi.hoisted(() => ({
  requireCredentialMock: vi.fn(),
  authorizeForRoleMock: vi.fn(),
  rpcMock: vi.fn(),
  fetchMock: vi.fn(),
}));

// Se simula la capa de resolución de credenciales, no su lógica: esa ya tiene sus
// propias pruebas en `candidate-results-authorization.test.ts`. Aquí lo que se
// comprueba es que la RUTA la consulta y respeta su veredicto.
vi.mock('@/lib/candidate-results/access-proof', () => ({
  requireCandidateResultCredential: requireCredentialMock,
  authorizeCredentialForRole: authorizeForRoleMock,
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

import { NextRequest } from 'next/server';

/** Cuerpo válido de un turno de apertura. */
function chatBody(overrides: Record<string, unknown> = {}) {
  return {
    roleId: 'rol-1',
    ticketToken: 'token-de-ticket',
    currentTopic: 'React',
    allTopics: [{ label: 'React', status: 'current', rubric: { weight: 5 } }],
    recentMessages: [],
    language: 'es',
    roleTitle: 'Desarrolladora Frontend',
    roleDescription: 'Puesto ficticio para la prueba',
    isLastTopic: false,
    interviewDuration: 30,
    candidateName: 'Candidata Ficticia',
    isOpeningPhase: true,
    sessionId: 'sesion-de-prueba',
    ...overrides,
  };
}

async function postChat(body: unknown): Promise<Response> {
  const { POST } = await import('@/app/api/chat/route');

  return POST(
    new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify(body),
    }),
  );
}

/** Cuenta las llamadas dirigidas a OpenRouter. */
function openRouterCalls(): number {
  return fetchMock.mock.calls.filter((call) => String(call[0]).includes('openrouter.ai')).length;
}

beforeEach(() => {
  vi.resetModules();
  requireCredentialMock.mockReset();
  authorizeForRoleMock.mockReset();
  rpcMock.mockReset();
  fetchMock.mockReset();

  process.env.OPENROUTER_API_KEY = 'clave-ficticia-de-openrouter';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proyecto-ficticio.supabase.co';
  // Sin clave de servicio la telemetría se omite, que es lo que interesa aquí para
  // que las pruebas no dependan de ella.
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});

  // Cuota disponible por defecto.
  rpcMock.mockResolvedValue({
    data: [{ allowed: true, remaining: 59, reset_at: new Date(Date.now() + 60_000).toISOString() }],
    error: null,
  });

  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { content: 'Hola, soy Zara. ¿Cuál es tu experiencia con React?' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        model: 'modelo-ficticio',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('validación de forma', () => {
  it('responde 400 a un cuerpo vacío, sin llamar al modelo', async () => {
    const response = await postChat({});

    // Antes esto era un 500: el manejador llegaba a `recentMessages.length` con
    // `undefined`.
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: 'validation_failed' });
    expect(openRouterCalls()).toBe(0);
  });

  it('responde 400 sin roleId', async () => {
    const body = chatBody();
    delete (body as Record<string, unknown>).roleId;

    const response = await postChat(body);

    expect(response.status).toBe(400);
    expect(openRouterCalls()).toBe(0);
  });

  it('responde 400 a un cuerpo que no es JSON', async () => {
    const { POST } = await import('@/app/api/chat/route');

    const response = await POST(
      new NextRequest('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'esto no es json',
      }),
    );

    expect(response.status).toBe(400);
    expect(openRouterCalls()).toBe(0);
  });

  it('responde 400 si se envían las dos credenciales a la vez', async () => {
    const response = await postChat(
      chatBody({ ticketToken: 'a', publicToken: 'b' }),
    );

    // Ninguna petición legítima envía las dos, y aceptarla obligaría a elegir un
    // orden de precedencia, que es una ambigüedad más en un camino de autorización.
    expect(response.status).toBe(400);
    expect(openRouterCalls()).toBe(0);
  });
});

describe('credencial ausente o inválida', () => {
  it('responde 401 sin credencial, sin llamar al modelo', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'no-credential',
      message: 'Unauthorized',
    });

    const body = chatBody();
    delete (body as Record<string, unknown>).ticketToken;

    const response = await postChat(body);

    expect(response.status).toBe(401);
    // Este es el objetivo del cambio completo: un anónimo no gasta ni un token.
    expect(openRouterCalls()).toBe(0);
  });

  it('responde 401 con un token que no existe', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: true,
      credential: { kind: 'ticket', token: 'token-inventado' },
    });
    authorizeForRoleMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'invalid-ticket-token',
      message: 'Unauthorized',
    });

    const response = await postChat(chatBody({ ticketToken: 'token-inventado' }));

    expect(response.status).toBe(401);
    expect(openRouterCalls()).toBe(0);
  });

  it('no distingue «no enviaste nada» de «tu token no existe»', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: true,
      credential: { kind: 'ticket', token: 'x' },
    });
    authorizeForRoleMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'invalid-ticket-token',
      message: 'Unauthorized',
    });

    const response = await postChat(chatBody());

    // Distinguirlos convertiría la ruta en un confirmador de tokens.
    await expect(response.json()).resolves.toMatchObject({ error: 'Unauthorized' });
  });
});

describe('credencial de otra vacante', () => {
  it('responde 403 y no llama al modelo', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: true,
      credential: { kind: 'ticket', token: 'token-de-otra-entrevista' },
    });
    authorizeForRoleMock.mockResolvedValue({
      ok: false,
      status: 403,
      reason: 'ticket-role-mismatch',
      message: 'Forbidden',
    });

    const response = await postChat(chatBody());

    expect(response.status).toBe(403);
    // Sin esta comprobación, un token válido de CUALQUIER entrevista serviría para
    // consumir cuota con el prompt de cualquier otra.
    expect(openRouterCalls()).toBe(0);
  });

  it('comprueba la credencial contra el roleId del cuerpo', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: true,
      credential: { kind: 'ticket', token: 'token-de-ticket' },
    });
    authorizeForRoleMock.mockResolvedValue({
      ok: true,
      via: 'ticket',
      roleId: 'rol-7',
      orgId: 'org-1',
    });

    await postChat(chatBody({ roleId: 'rol-7' }));

    expect(authorizeForRoleMock).toHaveBeenCalledWith(
      { kind: 'ticket', token: 'token-de-ticket' },
      'rol-7',
    );
  });
});

describe('tope de tasa', () => {
  it('responde 429 con la cuota agotada, sin llamar al modelo', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: true,
      credential: { kind: 'ticket', token: 'token-de-ticket' },
    });
    authorizeForRoleMock.mockResolvedValue({
      ok: true,
      via: 'ticket',
      roleId: 'rol-1',
      orgId: 'org-1',
    });

    rpcMock.mockResolvedValue({
      data: [{ allowed: false, remaining: 0, reset_at: new Date(Date.now() + 30_000).toISOString() }],
      error: null,
    });

    const response = await postChat(chatBody());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: 'rate_limited' });
    expect(openRouterCalls()).toBe(0);
  });

  it('el tope se aplica DESPUÉS de autorizar', async () => {
    requireCredentialMock.mockResolvedValue({
      ok: false,
      status: 401,
      reason: 'no-credential',
      message: 'Unauthorized',
    });

    await postChat(chatBody());

    // Un anónimo no debe poder agotar la cuota de un identificador ajeno: si el
    // tope se consumiera antes de autorizar, sería una denegación de servicio
    // dirigida contra un candidato concreto.
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('camino autorizado', () => {
  beforeEach(() => {
    requireCredentialMock.mockResolvedValue({
      ok: true,
      credential: { kind: 'ticket', token: 'token-de-ticket' },
    });
    authorizeForRoleMock.mockResolvedValue({
      ok: true,
      via: 'ticket',
      roleId: 'rol-1',
      orgId: 'org-1',
    });
  });

  it('responde 200 con el mensaje de Zara', async () => {
    const response = await postChat(chatBody());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      message: expect.stringContaining('Zara'),
      sentiment: null,
    });

    expect(openRouterCalls()).toBe(1);
  });

  it('envía el prompt de sistema con el presupuesto de preguntas del turno', async () => {
    await postChat(chatBody());

    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('openrouter.ai'));
    const payload = JSON.parse(String((call?.[1] as RequestInit).body));
    const systemPrompt = payload.messages[0].content;

    expect(payload.messages[0].role).toBe('system');
    // Las reglas duras que gobiernan el comportamiento de la entrevistadora tienen
    // que llegar al modelo; si el refactor las perdiera, Zara repetiría preguntas y
    // no respetaría el presupuesto por tema.
    expect(systemPrompt).toContain('RULE 3 — QUESTION COUNTER');
    expect(systemPrompt).toContain('RULE 4 — NEVER REPEAT QUESTIONS');
    expect(systemPrompt).toContain('PHASE: OPENING');
    expect(systemPrompt).toContain('Desarrolladora Frontend');
  });

  it('no acepta un roleId distinto del que acredita la credencial para la telemetría', async () => {
    authorizeForRoleMock.mockResolvedValue({
      ok: true,
      via: 'ticket',
      // La credencial acredita `rol-1` aunque el cuerpo pidiera otro.
      roleId: 'rol-1',
      orgId: 'org-1',
    });

    const response = await postChat(chatBody({ roleId: 'rol-1' }));

    expect(response.status).toBe(200);
  });

  it('propaga un fallo del proveedor como 502, no como 200 vacío', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited by provider', { status: 429 }));

    const response = await postChat(chatBody());

    expect(response.status).toBe(502);
    // El cuerpo del error del proveedor puede contener detalles de la cuenta y del
    // saldo, así que no viaja al cliente.
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('rate limited by provider');
  });
});
