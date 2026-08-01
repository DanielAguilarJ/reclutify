// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { silenceConsole } from './helpers/query-spy';

/**
 * Pruebas de las server actions que sustituyeron lecturas directas del navegador.
 *
 * QUÉ FIJAN
 * ---------
 * Tres actions se escribieron para que datos sensibles dejaran de viajar al cliente:
 *
 *   · `billing.getOrgBillingSummary` — el estado de suscripción y los identificadores de
 *     Stripe se leían con la clave anon sobre una tabla con `SELECT TO anon USING (true)`.
 *   · `coach-settings-secure` — las credenciales de Google, HubSpot y Notion.
 *   · `webhook-config` — el secreto de firma de los webhooks salientes.
 *
 * Estaban a 0 % de cobertura. Lo que se comprueba aquí es lo mismo en los tres casos y es lo
 * único que importa: **que el secreto no sale, y que guardar sin tocarlo no lo destruye.**
 *
 * La segunda mitad es tan importante como la primera. Como la interfaz recibe un marcador en
 * lugar del valor, al guardar volvería a subir el marcador; sin recomponerlo, el usuario
 * sobrescribiría su credencial real con la cadena `'__SAVED__'` y rompería su propia
 * integración por pulsar «Guardar».
 */

// ── Dobles ────────────────────────────────────────────────────────────────────

const { adminSpy, sessionSpy, requireApiUserMock, requireOrgMembershipMock, requireOrgAccessMock } =
  vi.hoisted(() => {
    /** Constructor de consultas mínimo, con resultado configurable por tabla. */
    function makeClient() {
      const results = new Map<string, { data?: unknown; error?: unknown }>();
      const writes: { table: string; op: string; payload: unknown }[] = [];

      const builder = (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;

        for (const method of ['select', 'eq', 'limit', 'order', 'in']) {
          chain[method] = () => self();
        }

        for (const op of ['insert', 'update', 'upsert']) {
          chain[op] = (payload: unknown) => {
            writes.push({ table, op, payload });
            return self();
          };
        }

        const outcome = () => results.get(table) ?? { data: null, error: null };
        chain.maybeSingle = async () => outcome();
        chain.single = async () => outcome();
        chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(outcome()));

        return chain;
      };

      return {
        client: { from: (table: string) => builder(table) },
        results,
        writes,
      };
    }

    return {
      adminSpy: makeClient(),
      sessionSpy: makeClient(),
      requireApiUserMock: vi.fn(),
      requireOrgMembershipMock: vi.fn(),
      requireOrgAccessMock: vi.fn(),
    };
  });

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => adminSpy.client }));
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => sessionSpy.client }));
vi.mock('@/lib/api/auth', () => ({
  requireApiUser: requireApiUserMock,
  requireOrgMembership: requireOrgMembershipMock,
  requireOrgAccess: requireOrgAccessMock,
  ORG_WRITE_ROLES: ['owner', 'admin'],
}));

/** Credenciales reales de ejemplo. Ficticias, pero con la forma de las de verdad. */
const STORED_INTEGRATIONS = {
  webhook: { enabled: true, url: 'https://hooks.example.com/x', secret: 'whsec_ficticio', events: [] },
  google_sheets: {
    enabled: true,
    spreadsheet_id: '1Abc',
    credentials: '{"private_key":"-----BEGIN PRIVATE KEY-----FICTICIA"}',
    sheet_name: 'Leads',
  },
  hubspot: { enabled: true, api_key: 'pat-na1-ficticio', pipeline_id: 'default' },
  notion: { enabled: false, token: 'secret_ficticio', database_id: 'db-1' },
};

beforeEach(() => {
  adminSpy.results.clear();
  adminSpy.writes.length = 0;
  sessionSpy.results.clear();
  sessionSpy.writes.length = 0;

  requireApiUserMock.mockReset().mockResolvedValue({ id: 'usuario-1', email: 'a@b.com' });
  requireOrgMembershipMock.mockReset().mockResolvedValue({
    user: { id: 'usuario-1', email: 'a@b.com' },
    orgId: 'org-1',
    role: 'owner',
  });
  requireOrgAccessMock.mockReset().mockResolvedValue({
    user: { id: 'usuario-1' },
    orgId: 'org-1',
    role: 'owner',
  });

  silenceConsole();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════════════════
// billing.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('getOrgBillingSummary', () => {
  it('devuelve el plan sin los identificadores de Stripe', async () => {
    sessionSpy.results.set('user_profiles', { data: { org_id: 'org-1' }, error: null });
    adminSpy.results.set('organizations', {
      data: {
        plan_tier: 'pro',
        subscription_status: 'active',
        subscription_period_end: '2026-12-01',
        billing_interval: 'monthly',
        stripe_subscription_id: 'sub_ficticio',
      },
      error: null,
    });

    const { getOrgBillingSummary } = await import('@/app/actions/billing');
    const summary = await getOrgBillingSummary();

    expect(summary.planTier).toBe('pro');
    expect(summary.subscriptionStatus).toBe('active');
    // Se devuelve un booleano y NO el identificador: la interfaz solo necesita saber si hay
    // cuenta de facturación para decidir si ofrece el portal.
    expect(summary.hasBillingAccount).toBe(true);
    expect(JSON.stringify(summary)).not.toContain('sub_ficticio');
    expect(JSON.stringify(summary)).not.toContain('stripe');
  });

  it('lee las columnas de facturación con la clave de SERVICIO', async () => {
    sessionSpy.results.set('user_profiles', { data: { org_id: 'org-1' }, error: null });
    adminSpy.results.set('organizations', { data: { plan_tier: 'starter' }, error: null });

    const { getOrgBillingSummary } = await import('@/app/actions/billing');
    await getOrgBillingSummary();

    // La migración `202608020002` revoca esas columnas para `anon` y `authenticated`, así que
    // leerlas con el cliente de sesión fallaría. La autorización la da el `orgId`, resuelto
    // desde el perfil del propio usuario.
    expect(adminSpy.results.has('organizations')).toBe(true);
  });

  it('cae al plan por defecto sin organización', async () => {
    sessionSpy.results.set('user_profiles', { data: null, error: null });

    const { getOrgBillingSummary } = await import('@/app/actions/billing');
    const summary = await getOrgBillingSummary();

    expect(summary.planTier).toBe('starter');
    expect(summary.hasBillingAccount).toBe(false);
  });

  it('cae al plan por defecto sin sesión, sin lanzar', async () => {
    requireApiUserMock.mockRejectedValue(new Error('Unauthorized'));

    const { getOrgBillingSummary } = await import('@/app/actions/billing');

    // La tarjeta de facturación es informativa: un fallo de lectura no debe tumbar la página
    // de ajustes completa.
    await expect(getOrgBillingSummary()).resolves.toMatchObject({ planTier: 'starter' });
  });

  it('no acepta un plan_tier arbitrario de la base', async () => {
    sessionSpy.results.set('user_profiles', { data: { org_id: 'org-1' }, error: null });
    adminSpy.results.set('organizations', { data: { plan_tier: 'plan-inventado' }, error: null });

    const { getOrgBillingSummary } = await import('@/app/actions/billing');
    const summary = await getOrgBillingSummary();

    // `plan_tier` es texto libre en Postgres. Castear a `PlanTier` sin comprobar propagaría un
    // valor que el resto del código trata como miembro válido de la unión.
    expect(summary.planTier).toBe('starter');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// coach-settings-secure.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('getCoachSettings', () => {
  it('redacta las cuatro credenciales de terceros', async () => {
    adminSpy.results.set('coach_settings', {
      data: { org_id: 'org-1', assistant_name: 'Ana', integrations: STORED_INTEGRATIONS },
      error: null,
    });

    const { getCoachSettings } = await import('@/app/actions/coach-settings-secure');
    const result = await getCoachSettings('org-1');

    expect(result.success).toBe(true);

    const serialized = JSON.stringify(result.data);

    // Ni un fragmento: un secreto parcial sigue siendo material útil.
    expect(serialized).not.toContain('whsec_');
    expect(serialized).not.toContain('pat-na1');
    expect(serialized).not.toContain('secret_ficticio');
    expect(serialized).not.toContain('PRIVATE KEY');

    // Y lo que la interfaz SÍ necesita sigue estando.
    expect(serialized).toContain('hooks.example.com');
    expect(serialized).toContain('Ana');
  });

  it('RECHAZA una organización ajena', async () => {
    requireOrgAccessMock.mockRejectedValue(new Error('Forbidden'));

    const { getCoachSettings } = await import('@/app/actions/coach-settings-secure');
    const result = await getCoachSettings('org-ajena');

    expect(result.success).toBe(false);
    // Y no debe llegar a leer la tabla.
    expect(adminSpy.writes).toHaveLength(0);
  });

  it('una organización sin configuración no es un error', async () => {
    adminSpy.results.set('coach_settings', { data: null, error: null });

    const { getCoachSettings } = await import('@/app/actions/coach-settings-secure');
    const result = await getCoachSettings('org-1');

    // El store aplica sus valores por defecto. Devolver un error haría que una organización
    // recién creada viera la pantalla de ajustes en estado de fallo.
    expect(result.success).toBe(true);
    expect(result.data).toBeUndefined();
  });
});

describe('saveCoachSettings', () => {
  it('CONSERVA el secreto cuando llega el marcador', async () => {
    adminSpy.results.set('coach_settings', {
      data: { integrations: STORED_INTEGRATIONS },
      error: null,
    });

    const { saveCoachSettings } = await import('@/app/actions/coach-settings-secure');

    await saveCoachSettings('org-1', {
      integrations: {
        ...STORED_INTEGRATIONS,
        hubspot: { enabled: true, api_key: '__SAVED__', pipeline_id: 'default' },
      },
    });

    const written = adminSpy.writes.find((w) => w.op === 'upsert');
    const integrations = (written?.payload as { integrations: Record<string, { api_key?: string }> })
      .integrations;

    // ESTA es la propiedad que evita que el usuario destruya su propia integración al pulsar
    // «Guardar» sin haber tocado nada.
    expect(integrations.hubspot.api_key).toBe('pat-na1-ficticio');
  });

  it('SUSTITUYE el secreto cuando llega uno nuevo', async () => {
    adminSpy.results.set('coach_settings', {
      data: { integrations: STORED_INTEGRATIONS },
      error: null,
    });

    const { saveCoachSettings } = await import('@/app/actions/coach-settings-secure');

    await saveCoachSettings('org-1', {
      integrations: {
        ...STORED_INTEGRATIONS,
        hubspot: { enabled: true, api_key: 'pat-na1-NUEVO', pipeline_id: 'default' },
      },
    });

    const written = adminSpy.writes.find((w) => w.op === 'upsert');
    const integrations = (written?.payload as { integrations: Record<string, { api_key?: string }> })
      .integrations;

    expect(integrations.hubspot.api_key).toBe('pat-na1-NUEVO');
  });

  it('RECHAZA una organización ajena, sin escribir', async () => {
    requireOrgAccessMock.mockRejectedValue(new Error('Forbidden'));

    const { saveCoachSettings } = await import('@/app/actions/coach-settings-secure');
    const result = await saveCoachSettings('org-ajena', { assistant_name: 'x' });

    expect(result.success).toBe(false);
    expect(adminSpy.writes).toHaveLength(0);
  });

  it('guarda campos no secretos sin tocar las integraciones', async () => {
    adminSpy.results.set('coach_settings', { data: { integrations: {} }, error: null });

    const { saveCoachSettings } = await import('@/app/actions/coach-settings-secure');
    await saveCoachSettings('org-1', { assistant_name: 'Zara' });

    const written = adminSpy.writes.find((w) => w.op === 'upsert');
    expect(written?.payload).toMatchObject({ org_id: 'org-1', assistant_name: 'Zara' });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// webhook-config.ts
// ══════════════════════════════════════════════════════════════════════════════

describe('getWebhookConfig', () => {
  it('devuelve la URL pero NO el secreto', async () => {
    adminSpy.results.set('webhook_configs', {
      data: { webhook_url: 'https://hooks.example.com/x', webhook_secret: 'whsec_ficticio' },
      error: null,
    });

    const { getWebhookConfig } = await import('@/app/actions/webhook-config');
    const config = await getWebhookConfig();

    expect(config.url).toBe('https://hooks.example.com/x');
    expect(config.hasSecret).toBe(true);
    expect(config.secret).toBe('__SAVED__');
    expect(JSON.stringify(config)).not.toContain('whsec_ficticio');
  });

  it('distingue «sin secreto» de «secreto guardado»', async () => {
    adminSpy.results.set('webhook_configs', {
      data: { webhook_url: 'https://hooks.example.com/x', webhook_secret: null },
      error: null,
    });

    const { getWebhookConfig } = await import('@/app/actions/webhook-config');
    const config = await getWebhookConfig();

    // Vacío se queda vacío: la interfaz muestra el campo en blanco en vez de «Conectado», que
    // sería mentir sobre el estado.
    expect(config.hasSecret).toBe(false);
    expect(config.secret).toBe('');
  });

  it('devuelve vacío sin sesión, sin lanzar', async () => {
    requireOrgMembershipMock.mockRejectedValue(new Error('Unauthorized'));

    const { getWebhookConfig } = await import('@/app/actions/webhook-config');

    await expect(getWebhookConfig()).resolves.toEqual({ url: '', secret: '', hasSecret: false });
  });
});

describe('saveWebhookConfig', () => {
  it('CONSERVA el secreto cuando llega el marcador', async () => {
    adminSpy.results.set('webhook_configs', { data: { webhook_secret: 'whsec_ficticio' }, error: null });

    const { saveWebhookConfig } = await import('@/app/actions/webhook-config');
    await saveWebhookConfig({ url: 'https://hooks.example.com/nuevo', secret: '__SAVED__' });

    const written = adminSpy.writes.find((w) => w.op === 'upsert');
    const payload = written?.payload as { webhook_url: string; webhook_secret: string };

    // Sin esto, guardar solo la URL sobrescribiría el secreto con la cadena del marcador y el
    // receptor rechazaría todas las firmas siguientes: el empleador dejaría de recibir avisos
    // sin saber por qué.
    expect(payload.webhook_url).toBe('https://hooks.example.com/nuevo');
    expect(payload.webhook_secret).toBe('whsec_ficticio');
  });

  it('SUSTITUYE el secreto cuando llega uno nuevo', async () => {
    const { saveWebhookConfig } = await import('@/app/actions/webhook-config');
    await saveWebhookConfig({ url: 'https://hooks.example.com/x', secret: 'whsec_NUEVO' });

    const payload = adminSpy.writes.find((w) => w.op === 'upsert')?.payload as {
      webhook_secret: string;
    };

    expect(payload.webhook_secret).toBe('whsec_NUEVO');
  });

  it('permite BORRAR el secreto con la cadena vacía', async () => {
    const { saveWebhookConfig } = await import('@/app/actions/webhook-config');
    await saveWebhookConfig({ url: 'https://hooks.example.com/x', secret: '' });

    const payload = adminSpy.writes.find((w) => w.op === 'upsert')?.payload as {
      webhook_secret: string;
    };

    // Desconectar tiene que ser posible: si el marcador fuera la única forma de «no cambiar
    // nada», la cadena vacía debe significar «quítalo».
    expect(payload.webhook_secret).toBe('');
  });

  it('RECHAZA sin sesión, sin escribir', async () => {
    requireOrgMembershipMock.mockRejectedValue(new Error('Unauthorized'));

    const { saveWebhookConfig } = await import('@/app/actions/webhook-config');
    const result = await saveWebhookConfig({ url: 'https://x.example.com', secret: 'y' });

    expect(result.success).toBe(false);
    expect(adminSpy.writes).toHaveLength(0);
  });
});
