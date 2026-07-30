// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// `server-only` es un centinela de Next que revienta fuera del grafo de
// servidor; en pruebas se neutraliza para poder importar la ruta.
vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';

/**
 * Pruebas del webhook de Stripe (`/api/stripe/webhooks`).
 *
 * LO QUE SE FIJA AQUÍ
 * -------------------
 * La ruta registraba el error de `update_org_subscription` y seguía adelante,
 * así que terminaba devolviendo `{ received: true }` con 200 incluso cuando la
 * escritura no se había aplicado. Stripe da el evento por entregado con un 2xx
 * y no lo reintenta nunca: la organización se quedaba con un estado de
 * suscripción obsoleto en silencio — quien pagó sigue en `starter`, quien
 * canceló conserva su plan de pago.
 *
 * La aserción central es "firma válida + RPC que devuelve error → 500", que es
 * lo único que hace que Stripe reintente. Alrededor:
 *
 *  - sin cabecera `stripe-signature` → 400 y CERO llamadas a la RPC;
 *  - firma que no verifica → 400 y cero llamadas;
 *  - RPC correcta → 200 con los parámetros esperados;
 *  - `SUPABASE_SERVICE_ROLE_KEY` ausente → 500 (no hay fallback a la clave anon);
 *  - `invoice.payment_succeeded` cuya suscripción es de otro cliente → se
 *    descarta sin escribir.
 *
 * TODOS LOS IDENTIFICADORES Y SECRETOS SON FICTICIOS.
 */

const FAKE_WEBHOOK_SECRET = 'whsec_ficticio_0123456789';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_ID = 'cus_ficticio_organizacion';
const OTHER_CUSTOMER_ID = 'cus_ficticio_ajeno';
const SUBSCRIPTION_ID = 'sub_ficticio_organizacion';

/**
 * Debe coincidir con la clave del `PRICE_TIER_MAP` de abajo. El mapa se define
 * literal dentro del factory del mock porque este se ejecuta antes de que las
 * constantes del módulo de prueba estén inicializadas.
 */
const PRICE_PRO_MONTHLY = 'price_ficticio_pro_mensual';

const PERIOD_END_SECONDS = 1_800_000_000;
const PERIOD_END_ISO = new Date(PERIOD_END_SECONDS * 1000).toISOString();
/** Centinela que la RPC traduce a NULL en `subscription_period_end`. */
const PERIOD_END_CLEARED = '1970-01-01T00:00:00Z';
/** Centinela que la RPC traduce a NULL en `stripe_subscription_id`. */
const SUBSCRIPTION_CLEARED = '__CLEAR__';

// ─── Dobles de Stripe ────────────────────────────────────────────────────────

interface FakeSubscription {
  id: string;
  status: string;
  customer: string;
  metadata: Record<string, string>;
  items: { data: Array<{ price: { id: string }; current_period_end: number }> };
}

function fakeSubscription(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  return {
    id: SUBSCRIPTION_ID,
    status: 'active',
    customer: CUSTOMER_ID,
    metadata: { org_id: ORG_ID },
    items: {
      data: [{ price: { id: PRICE_PRO_MONTHLY }, current_period_end: PERIOD_END_SECONDS }],
    },
    ...overrides,
  };
}

interface FakeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

function fakeEvent(type: string, object: unknown, id = `evt_ficticio_${type}`): FakeEvent {
  return { id, type, data: { object } };
}

const constructEvent = vi.fn<(body: string, signature: string, secret: string) => FakeEvent>();
const retrieveSubscription = vi.fn<(id: string) => Promise<FakeSubscription>>();

vi.mock('@/lib/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: (body: string, signature: string, secret: string) =>
        constructEvent(body, signature, secret),
    },
    subscriptions: {
      retrieve: (id: string) => retrieveSubscription(id),
    },
  },
  PRICE_TIER_MAP: {
    price_ficticio_pro_mensual: { tier: 'pro', interval: 'monthly' },
  },
}));

// ─── Doble del cliente admin ─────────────────────────────────────────────────

type RpcParams = Record<string, string | null>;
interface RpcOutcome {
  data: null;
  error: { message: string; code?: string } | null;
}

const rpc = vi.fn<(fn: string, params: RpcParams) => Promise<RpcOutcome>>();

/** Simula el entorno sin clave de servicio (ver `createAdminClient`). */
let serviceRoleKeyMissing = false;

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => {
    if (serviceRoleKeyMissing) {
      // Mismo error que lanza el módulo real; su comportamiento propio ya está
      // cubierto en `src/__tests__/supabase-key.test.ts`.
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    return { rpc };
  },
}));

import { POST } from '@/app/api/stripe/webhooks/route';

// ─── Utilidades de la suite ──────────────────────────────────────────────────

function request(headers: Record<string, string> = { 'stripe-signature': 'firma-ficticia' }) {
  return new NextRequest('http://localhost/api/stripe/webhooks', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ignorado: 'el payload real lo devuelve constructEvent' }),
  });
}

function rpcParamsOf(callIndex = 0): RpcParams {
  const call = rpc.mock.calls[callIndex];
  expect(call).toBeDefined();
  expect(call[0]).toBe('update_org_subscription');
  return call[1];
}

const RPC_FAILURE: RpcOutcome = {
  data: null,
  error: { message: 'permission denied for function update_org_subscription', code: '42501' },
};

let originalSecret: string | undefined;

beforeEach(() => {
  originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = FAKE_WEBHOOK_SECRET;
  serviceRoleKeyMissing = false;

  constructEvent.mockReset();
  retrieveSubscription.mockReset();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
  retrieveSubscription.mockResolvedValue(fakeSubscription());

  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  vi.restoreAllMocks();
});

// ─── Firma ───────────────────────────────────────────────────────────────────

describe('POST /api/stripe/webhooks — verificación de firma', () => {
  it('responde 400 sin la cabecera stripe-signature y no verifica ni escribe', async () => {
    const res = await POST(request({}));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'Missing stripe-signature header' });
    expect(constructEvent).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('responde 400 cuando la firma no verifica y no escribe nada', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const res = await POST(request());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: 'Webhook signature verification failed',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('verifica el cuerpo crudo contra el secreto configurado', async () => {
    constructEvent.mockReturnValue(fakeEvent('customer.subscription.updated', fakeSubscription()));

    const res = await POST(request({ 'stripe-signature': 'firma-ficticia' }));

    expect(res.status).toBe(200);
    const [body, signature, secret] = constructEvent.mock.calls[0];
    expect(body).toContain('el payload real lo devuelve constructEvent');
    expect(signature).toBe('firma-ficticia');
    expect(secret).toBe(FAKE_WEBHOOK_SECRET);
  });
});

// ─── El bug: fallo de escritura silenciado ───────────────────────────────────

describe('POST /api/stripe/webhooks — un fallo de la RPC devuelve 500 para que Stripe reintente', () => {
  it('responde 500 cuando la RPC falla en checkout.session.completed', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        mode: 'subscription',
        metadata: { org_id: ORG_ID },
        subscription: SUBSCRIPTION_ID,
        customer: CUSTOMER_ID,
      }),
    );
    rpc.mockResolvedValue(RPC_FAILURE);

    const res = await POST(request());

    // Antes de la corrección esto era 200 con `{ received: true }`: Stripe daba
    // el pago por sincronizado y la org se quedaba en el plan anterior.
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: 'Webhook handler error' });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('responde 500 cuando la RPC falla en customer.subscription.deleted', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('customer.subscription.deleted', fakeSubscription({ status: 'canceled' })),
    );
    rpc.mockResolvedValue(RPC_FAILURE);

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('responde 500 cuando la RPC falla en invoice.payment_failed', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('invoice.payment_failed', { customer: CUSTOMER_ID }),
    );
    rpc.mockResolvedValue(RPC_FAILURE);

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('no filtra el mensaje de la base de datos en la respuesta', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('invoice.payment_failed', { customer: CUSTOMER_ID }),
    );
    rpc.mockResolvedValue(RPC_FAILURE);

    const res = await POST(request());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain('permission denied');
  });

  it('responde 500 cuando falta SUPABASE_SERVICE_ROLE_KEY, sin intentar la RPC', async () => {
    serviceRoleKeyMissing = true;
    constructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        mode: 'subscription',
        metadata: { org_id: ORG_ID },
        subscription: SUBSCRIPTION_ID,
        customer: CUSTOMER_ID,
      }),
    );

    const res = await POST(request());

    expect(res.status).toBe(500);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ─── Camino correcto por tipo de evento ──────────────────────────────────────

describe('POST /api/stripe/webhooks — escrituras con la RPC correcta', () => {
  it('checkout.session.completed sube la org al plan del precio comprado', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        mode: 'subscription',
        metadata: { org_id: ORG_ID },
        subscription: SUBSCRIPTION_ID,
        customer: CUSTOMER_ID,
      }),
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(rpcParamsOf()).toMatchObject({
      p_org_id: ORG_ID,
      p_stripe_customer_id: CUSTOMER_ID,
      p_stripe_subscription_id: SUBSCRIPTION_ID,
      p_plan_tier: 'pro',
      p_billing_interval: 'monthly',
      p_subscription_status: 'active',
      p_subscription_period_end: PERIOD_END_ISO,
    });
  });

  it('checkout.session.completed sin org_id no escribe y responde 200', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('checkout.session.completed', {
        mode: 'subscription',
        metadata: {},
        subscription: SUBSCRIPTION_ID,
        customer: CUSTOMER_ID,
      }),
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('customer.subscription.deleted baja a starter y limpia los centinelas', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('customer.subscription.deleted', fakeSubscription({ status: 'canceled' })),
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpcParamsOf()).toMatchObject({
      p_org_id: ORG_ID,
      p_plan_tier: 'starter',
      p_subscription_status: 'canceled',
      p_stripe_subscription_id: SUBSCRIPTION_CLEARED,
      p_subscription_period_end: PERIOD_END_CLEARED,
    });
  });

  it('customer.subscription.deleted sin org_id resuelve por id de suscripción', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('customer.subscription.deleted', fakeSubscription({ metadata: {} })),
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpcParamsOf()).toMatchObject({
      p_org_id: null,
      p_lookup_by_subscription: SUBSCRIPTION_ID,
      p_plan_tier: 'starter',
    });
  });

  it('invoice.payment_failed marca past_due resolviendo por cliente', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('invoice.payment_failed', { customer: CUSTOMER_ID }),
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpcParamsOf()).toMatchObject({
      p_lookup_by_customer: CUSTOMER_ID,
      p_subscription_status: 'past_due',
      p_org_id: null,
      p_plan_tier: null,
    });
  });

  it('un evento de tipo no manejado responde 200 sin escribir', async () => {
    constructEvent.mockReturnValue(fakeEvent('customer.created', { id: CUSTOMER_ID }));

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });
});

// ─── invoice.payment_succeeded: la suscripción debe ser del cliente ──────────

describe('POST /api/stripe/webhooks — invoice.payment_succeeded', () => {
  function paidInvoice(customer: string | null = CUSTOMER_ID) {
    return fakeEvent('invoice.payment_succeeded', {
      customer,
      parent: { subscription_details: { subscription: SUBSCRIPTION_ID } },
    });
  }

  it('marca active y renueva el periodo cuando la suscripción es de ese cliente', async () => {
    constructEvent.mockReturnValue(paidInvoice());

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpcParamsOf()).toMatchObject({
      p_lookup_by_customer: CUSTOMER_ID,
      p_subscription_status: 'active',
      p_subscription_period_end: PERIOD_END_ISO,
    });
  });

  it('descarta el evento sin escribir si la suscripción es de otro cliente', async () => {
    constructEvent.mockReturnValue(paidInvoice());
    retrieveSubscription.mockResolvedValue(
      fakeSubscription({ customer: OTHER_CUSTOMER_ID }),
    );

    const res = await POST(request());

    // No es un fallo transitorio: reintentar daría el mismo desajuste, así que
    // se acepta el evento pero no se escribe el periodo de una suscripción ajena.
    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('no escribe cuando la factura no trae suscripción', async () => {
    constructEvent.mockReturnValue(
      fakeEvent('invoice.payment_succeeded', { customer: CUSTOMER_ID, parent: null }),
    );

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(rpc).not.toHaveBeenCalled();
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });
});

// ─── Idempotencia: reaplicar el mismo evento converge al mismo estado ────────

describe('POST /api/stripe/webhooks — idempotencia del reintento', () => {
  it('el reintento del mismo evento envía exactamente los mismos parámetros', async () => {
    // Por esto no se deduplica por `event.id`: la RPC escribe estado absoluto,
    // así que el reintento que provoca el 500 no acumula ni duplica nada.
    constructEvent.mockReturnValue(
      fakeEvent('customer.subscription.updated', fakeSubscription()),
    );

    const first = await POST(request());
    const second = await POST(request());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpcParamsOf(1)).toEqual(rpcParamsOf(0));
  });
});
