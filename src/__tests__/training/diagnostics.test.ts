import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

import { GET } from '@/app/api/training/diagnostics/route';
import { DEFAULT_AI_MODEL } from '@/lib/ai-model';
import {
  TRAINING_DOCUMENTS_BUCKET,
  TRAINING_ENVIRONMENT_FUNCTIONS,
  TRAINING_ENVIRONMENT_INDEXES,
  TRAINING_ENVIRONMENT_NULLABLE_COLUMNS,
  TRAINING_ENVIRONMENT_PRESENT_COLUMNS,
  TRAINING_ENVIRONMENT_REPORT_FUNCTION,
  TRAINING_ENVIRONMENT_TABLES,
} from '@/lib/training/diagnostics';

// ============================================================
// Mock de Supabase (cliente encadenable)
// ============================================================

interface FluentMock {
  select: (cols?: string, opts?: unknown) => FluentMock;
  eq: (col: string, val: unknown) => FluentMock;
  in: (col: string, val: unknown) => FluentMock;
  limit: (n: number) => FluentMock;
  order: (col: string, opts?: unknown) => FluentMock;
  maybeSingle: () => Promise<unknown>;
  single: () => Promise<unknown>;
  then: (resolve: (val: unknown) => unknown) => Promise<unknown>;
}

interface QueryRecord {
  table: string;
  columns: string | undefined;
  filters: Array<[string, unknown]>;
}

let queries: QueryRecord[] = [];

const createFluentMock = (table: string, resolvedValue: unknown): FluentMock => {
  const record: QueryRecord = { table, columns: undefined, filters: [] };
  queries.push(record);

  const fluent: FluentMock = {
    select: (cols) => {
      record.columns = cols;
      return fluent;
    },
    eq: (col, val) => {
      record.filters.push([col, val]);
      return fluent;
    },
    in: (col, val) => {
      record.filters.push([col, val]);
      return fluent;
    },
    limit: () => fluent,
    order: () => fluent,
    maybeSingle: async () => resolvedValue,
    single: async () => resolvedValue,
    then: (resolve) => Promise.resolve(resolvedValue).then(resolve),
  };

  return fluent;
};

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const OTHER_ORG_ID = '00000000-0000-4000-8000-0000000000bb';
const USER_ID = 'usr-1';

let mockUser: { id: string } | null = { id: USER_ID };
let mockGetUserError: unknown = null;
let mockProfileResult: unknown = { data: { org_id: ORG_ID }, error: null };
let mockMembershipResult: unknown = { data: { role: 'owner' }, error: null };
let missingTables = new Set<string>();

const tableResult = (table: string): unknown => {
  if (table === 'user_profiles') {
    return mockProfileResult;
  }

  if (table === 'org_members') {
    return mockMembershipResult;
  }

  if (missingTables.has(table)) {
    return {
      data: null,
      error: {
        code: '42P01',
        message: `relation "public.${table}" does not exist`,
      },
    };
  }

  return { data: [], count: 0, error: null };
};

const mockFrom = vi.fn((table: string) => createFluentMock(table, tableResult(table)));
const mockRpc = vi.fn();
const mockListBuckets = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mockUser },
        error: mockGetUserError,
      }),
    },
  }),
}));

vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
    storage: {
      listBuckets: mockListBuckets,
    },
  }),
}));

// ============================================================
// Utilidades del reporte
// ============================================================

const allTrue = (keys: readonly string[]): Record<string, boolean> =>
  Object.fromEntries(keys.map((key) => [key, true]));

/** Reporte de un entorno completamente instalado, tal como lo devolvería la RPC. */
const healthyReport = () => ({
  tables: allTrue(TRAINING_ENVIRONMENT_TABLES),
  nullable_columns: allTrue(TRAINING_ENVIRONMENT_NULLABLE_COLUMNS),
  columns: allTrue(TRAINING_ENVIRONMENT_PRESENT_COLUMNS),
  functions: allTrue(TRAINING_ENVIRONMENT_FUNCTIONS),
  buckets: {
    [TRAINING_DOCUMENTS_BUCKET]: {
      exists: true,
      public: false,
      file_size_limit: 15 * 1024 * 1024,
    },
  },
  indexes: allTrue(TRAINING_ENVIRONMENT_INDEXES),
});

interface DiagnosticsCheck {
  id: string;
  label: string;
  severity: 'critical' | 'warning';
  remediation: string;
  kind: string;
  key: string;
  status: 'ok' | 'missing' | 'unknown';
  detail?: string;
}

interface DiagnosticsBody {
  ok: boolean;
  source: 'rpc' | 'probe';
  env: Record<string, boolean>;
  membership: { role: string };
  checks: DiagnosticsCheck[];
  summary: { passed: number; failed: number; warnings: number };
}

const findCheck = (body: DiagnosticsBody, id: string): DiagnosticsCheck => {
  const check = body.checks.find((candidate) => candidate.id === id);
  expect(check, `check ${id} should exist in the report`).toBeDefined();
  return check as DiagnosticsCheck;
};

const request = (search = '') =>
  new NextRequest(`http://localhost/api/training/diagnostics${search}`, {
    method: 'GET',
  });

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'OPENROUTER_API_KEY',
  'TRAINING_AI_MODEL',
] as const;

/**
 * Valores FICTICIOS y evidentemente falsos para las claves. Ninguna clave real
 * puede entrar aquí: quedaría en el historial de git para siempre.
 *
 * El fixture tiene que tener FORMA VÁLIDA de clave de servicio. Antes era
 * `'service-role-key'`, que la validación de forma clasifica como inválida: los
 * casos que decían «la variable crítica está bien» habrían dejado de probar eso.
 */
const FAKE_SERVICE_ROLE_KEY = 'sb_secret_EJEMPLO-FICTICIO-NO-ES-UNA-CLAVE-REAL';

/** JWT de tres segmentos con `role: "anon"`; la firma es relleno inútil. */
const FAKE_ANON_JWT = [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' }), 'utf8').toString('base64url'),
  Buffer.from(JSON.stringify({ iss: 'supabase', role: 'anon' }), 'utf8').toString('base64url'),
  'ZmlybWEtZmljdGljaWEtbm8tdmVyaWZpY2E',
].join('.');

let originalEnv: Record<string, string | undefined> = {};

describe('Training Diagnostics Endpoint (/api/training/diagnostics)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queries = [];

    mockUser = { id: USER_ID };
    mockGetUserError = null;
    mockProfileResult = { data: { org_id: ORG_ID }, error: null };
    mockMembershipResult = { data: { role: 'owner' }, error: null };
    missingTables = new Set<string>();

    originalEnv = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    );

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_ROLE_KEY;
    process.env.OPENROUTER_API_KEY = 'openrouter-key';
    // Sin variable de modelo: el entorno sano usa el defecto del proyecto, que
    // es un desenlace correcto y no debe contar como advertencia.
    delete process.env.TRAINING_AI_MODEL;

    // Camino preferente: la RPC de reporte existe y el entorno está sano.
    mockRpc.mockImplementation(async (name: string) => {
      if (name === TRAINING_ENVIRONMENT_REPORT_FUNCTION) {
        return { data: healthyReport(), error: null };
      }

      return { data: null, error: null };
    });

    mockListBuckets.mockResolvedValue({
      data: [
        {
          id: TRAINING_DOCUMENTS_BUCKET,
          name: TRAINING_DOCUMENTS_BUCKET,
          public: false,
          file_size_limit: 15 * 1024 * 1024,
        },
      ],
      error: null,
    });
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

  // Requisito 1.7
  it('returns the report from the RPC when the function exists', async () => {
    const res = await GET(request(`?orgId=${ORG_ID}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as DiagnosticsBody;

    expect(body.source).toBe('rpc');
    expect(body.ok).toBe(true);
    expect(body.summary.failed).toBe(0);
    expect(body.summary.warnings).toBe(0);
    expect(body.checks.every((check) => check.status === 'ok')).toBe(true);
    expect(body.membership.role).toBe('owner');

    // El reporte se pidió por RPC, no por sondeo de tablas.
    expect(mockRpc).toHaveBeenCalledWith(TRAINING_ENVIRONMENT_REPORT_FUNCTION);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(
      queries.some((query) => TRAINING_ENVIRONMENT_TABLES.includes(query.table)),
    ).toBe(false);

    // El bucket privado reporta su límite de tamaño como dato adicional.
    expect(
      findCheck(body, `storage.bucket.${TRAINING_DOCUMENTS_BUCKET}`).detail,
    ).toBe('Límite de archivo: 15 MB');
  });

  // Requisitos 1.5, 1.6
  it('falls back to probing when the RPC responds 42883 and identifies missing items', async () => {
    missingTables = new Set([
      'training_program_documents',
      'training_module_documents',
      'training_document_chunks',
      'training_access_sessions',
    ]);

    const missingFunctions = new Set([
      'hire_training_candidate',
      'start_training_module',
    ]);

    mockRpc.mockImplementation(async (name: string) => {
      if (name === TRAINING_ENVIRONMENT_REPORT_FUNCTION) {
        return {
          data: null,
          error: {
            code: '42883',
            message:
              'function public.training_environment_report() does not exist',
          },
        };
      }

      if (missingFunctions.has(name)) {
        return {
          data: null,
          error: {
            code: '42883',
            message: `function public.${name}() does not exist`,
          },
        };
      }

      // La función existe y rechaza la llamada: eso la confirma.
      return {
        data: null,
        error: { code: 'P0001', message: 'exception: forbidden' },
      };
    });

    // El bucket tampoco está creado.
    mockListBuckets.mockResolvedValue({ data: [], error: null });

    const res = await GET(request(`?orgId=${ORG_ID}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as DiagnosticsBody;

    expect(body.source).toBe('probe');
    expect(body.ok).toBe(false);

    // Tablas ausentes, con la migración que las provee.
    for (const table of missingTables) {
      const check = findCheck(body, `table.${table}`);
      expect(check.status).toBe('missing');
      expect(check.severity).toBe('critical');
      expect(check.remediation).toContain(
        '202607180001_training_v2_foundation.sql',
      );
    }

    // Tablas presentes.
    expect(findCheck(body, 'table.training_programs').status).toBe('ok');
    expect(findCheck(body, 'table.training_modules').status).toBe('ok');

    // Funciones ausentes vs. funciones que existen.
    for (const name of missingFunctions) {
      const check = findCheck(body, `function.${name}`);
      expect(check.status).toBe('missing');
      expect(check.remediation).toMatch(/^Aplicar 2026071800/);
    }

    // El resto del catálogo de funciones existe y queda en `ok`.
    for (const name of TRAINING_ENVIRONMENT_FUNCTIONS) {
      if (missingFunctions.has(name)) {
        continue;
      }

      expect(findCheck(body, `function.${name}`).status).toBe('ok');
    }

    // Bucket ausente: crítico. Su privacidad no es concluyente.
    expect(
      findCheck(body, `storage.bucket.${TRAINING_DOCUMENTS_BUCKET}`).status,
    ).toBe('missing');
    expect(
      findCheck(body, `storage.bucket.${TRAINING_DOCUMENTS_BUCKET}.private`)
        .status,
    ).toBe('unknown');

    // Tablas ausentes + funciones ausentes + el bucket: el conteo se deriva
    // de los conjuntos sondeados, no de un número fijo, para que crecer el
    // catálogo no rompa la prueba.
    expect(body.summary.failed).toBe(
      missingTables.size + missingFunctions.size + 1,
    );
  });

  // Requisito 1.6: limitación documentada del respaldo por sondeo.
  it('leaves nullability and index checks as unknown when probing, without invalidating ok', async () => {
    mockRpc.mockImplementation(async (name: string) => {
      if (name === TRAINING_ENVIRONMENT_REPORT_FUNCTION) {
        return {
          data: null,
          error: {
            code: '42883',
            message:
              'function public.training_environment_report() does not exist',
          },
        };
      }

      return {
        data: null,
        error: { code: 'P0001', message: 'exception: forbidden' },
      };
    });

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    expect(body.source).toBe('probe');

    for (const column of TRAINING_ENVIRONMENT_NULLABLE_COLUMNS) {
      const check = findCheck(body, `column.nullable.${column}`);
      expect(check.status).toBe('unknown');
      expect(check.status).not.toBe('missing');
    }

    for (const index of TRAINING_ENVIRONMENT_INDEXES) {
      expect(findCheck(body, `index.${index}`).status).toBe('unknown');
    }

    // Los `unknown` no cuentan como fallo ni como advertencia, y no rompen `ok`.
    expect(body.summary.failed).toBe(0);
    expect(body.summary.warnings).toBe(0);
    expect(body.ok).toBe(true);
  });

  // Requisito 1.5
  it('resolves orgId from user_profiles when it is not passed as a query param', async () => {
    const res = await GET(request());
    expect(res.status).toBe(200);

    const body = (await res.json()) as DiagnosticsBody;
    expect(body.ok).toBe(true);

    const profileQuery = queries.find((query) => query.table === 'user_profiles');
    expect(profileQuery?.columns).toBe('org_id');
    expect(profileQuery?.filters).toEqual([['user_id', USER_ID]]);

    // La autorización se hace contra la organización resuelta.
    const membershipQuery = queries.find((query) => query.table === 'org_members');
    expect(membershipQuery?.filters).toContainEqual(['org_id', ORG_ID]);
    expect(membershipQuery?.filters).toContainEqual(['user_id', USER_ID]);
  });

  it('returns 400 when the account has no organization and no orgId is passed', async () => {
    mockProfileResult = { data: { org_id: null }, error: null };

    const res = await GET(request());
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  // Requisitos 1.5, 11.4
  it('returns 403 to a user who is neither owner nor admin', async () => {
    mockMembershipResult = { data: null, error: null };

    const res = await GET(request(`?orgId=${OTHER_ORG_ID}`));
    expect(res.status).toBe(403);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('Forbidden');

    // Nada del entorno se recolecta antes de autorizar.
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockListBuckets).not.toHaveBeenCalled();
  });

  // Requisito 1.5: OPENROUTER_API_KEY es advertencia, no fallo.
  it('reports a missing OPENROUTER_API_KEY as a warning without changing ok', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const res = await GET(request(`?orgId=${ORG_ID}`));
    expect(res.status).toBe(200);

    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.OPENROUTER_API_KEY');
    expect(check.severity).toBe('warning');
    expect(check.status).toBe('missing');

    expect(body.env.OPENROUTER_API_KEY).toBe(false);
    expect(body.summary.warnings).toBe(1);
    expect(body.summary.failed).toBe(0);
    expect(body.ok).toBe(true);

    // Las variables críticas siguen presentes y ninguna clave se filtra.
    expect(findCheck(body, 'env.SUPABASE_SERVICE_ROLE_KEY').status).toBe('ok');
    expect(JSON.stringify(body)).not.toContain('service-role-key');
    expect(JSON.stringify(body)).not.toContain(FAKE_SERVICE_ROLE_KEY);
  });

  // ============================================================
  // Los tres estados de SUPABASE_SERVICE_ROLE_KEY
  // ============================================================

  it('reports a well-shaped service role key as ok', async () => {
    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.SUPABASE_SERVICE_ROLE_KEY');
    expect(check.status).toBe('ok');
    expect(check.detail).toBeUndefined();
    expect(body.env.SUPABASE_SERVICE_ROLE_KEY).toBe(true);
    expect(body.ok).toBe(true);
  });

  it('reports a missing critical env variable as a failure', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.SUPABASE_SERVICE_ROLE_KEY');
    expect(check.severity).toBe('critical');
    expect(check.status).toBe('missing');
    // El caso «ausente» pide definir la variable, sin hablar de formas.
    expect(check.remediation).toBe(
      'Definir SUPABASE_SERVICE_ROLE_KEY en el entorno del despliegue',
    );
    expect(check.detail).toBeUndefined();
    expect(body.env.SUPABASE_SERVICE_ROLE_KEY).toBe(false);
    expect(body.summary.failed).toBe(1);
    expect(body.ok).toBe(false);
  });

  it('fails the check when the variable is set to a value that is not a service role key', async () => {
    // El fallo que originó la validación: el NOMBRE de la fila del panel pegado
    // como si fuera su VALOR. Antes reportaba `ok`.
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role';

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.SUPABASE_SERVICE_ROLE_KEY');
    expect(check.severity).toBe('critical');
    expect(check.status).toBe('missing');
    // Distinguible del caso «ausente»: la variable está definida y la
    // remediación dice exactamente qué copiar.
    expect(check.detail).toContain('definida');
    expect(check.remediation).toContain('VALOR de la fila service_role');
    expect(check.remediation).not.toBe(
      'Definir SUPABASE_SERVICE_ROLE_KEY en el entorno del despliegue',
    );

    expect(body.env.SUPABASE_SERVICE_ROLE_KEY).toBe(false);
    expect(body.summary.failed).toBe(1);
    expect(body.ok).toBe(false);
  });

  it('says so explicitly when the anon key was pasted into the service role variable', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_ANON_JWT;

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.SUPABASE_SERVICE_ROLE_KEY');
    expect(check.status).toBe('missing');
    expect(check.remediation).toMatch(/anon/i);
    expect(check.remediation).toMatch(/RLS/);
    expect(check.remediation).toContain('VALOR de la fila service_role');
    expect(body.ok).toBe(false);

    // Ni el valor ni fragmentos suyos aparecen en la respuesta.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(FAKE_ANON_JWT);
    expect(serialized).not.toContain(FAKE_ANON_JWT.slice(0, 12));
  });

  // ============================================================
  // Los tres desenlaces de TRAINING_AI_MODEL
  //
  // El diagnóstico no comprobaba esta variable: un identificador mal escrito no
  // salía en el panel y solo aparecía como un 404 de OpenRouter en los logs del
  // servidor. La verificación es de FORMA, sin red: el catálogo de OpenRouter no
  // se puede consultar desde aquí.
  // ============================================================

  it('reports the default model as ok when TRAINING_AI_MODEL is not set', async () => {
    delete process.env.TRAINING_AI_MODEL;

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.TRAINING_AI_MODEL');
    expect(check.status).toBe('ok');
    // No basta con no fallar: el reporte tiene que decir qué modelo se usa.
    expect(check.detail).toContain(DEFAULT_AI_MODEL);
    expect(body.env.TRAINING_AI_MODEL).toBe(true);
    expect(body.summary.warnings).toBe(0);
    expect(body.summary.failed).toBe(0);
    expect(body.ok).toBe(true);
  });

  it('reports the default model as ok when TRAINING_AI_MODEL is empty', async () => {
    // `TRAINING_AI_MODEL=` en el entorno: la forma que invita `.env.example` y la
    // que deja una variable borrada a medias en el panel del despliegue.
    process.env.TRAINING_AI_MODEL = '   ';

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.TRAINING_AI_MODEL');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain(DEFAULT_AI_MODEL);
    expect(body.env.TRAINING_AI_MODEL).toBe(true);
    expect(body.summary.warnings).toBe(0);
    expect(body.ok).toBe(true);
  });

  it('reports a well-shaped configured model as ok, naming the model in use', async () => {
    process.env.TRAINING_AI_MODEL = 'google/gemini-2.5-flash';

    const res = await GET(request(`?orgId=${ORG_ID}`));
    const body = (await res.json()) as DiagnosticsBody;

    const check = findCheck(body, 'env.TRAINING_AI_MODEL');
    expect(check.status).toBe('ok');
    expect(check.detail).toContain('google/gemini-2.5-flash');
    // El modelo configurado manda: el reporte no puede anunciar el defecto.
    expect(check.detail).not.toContain(DEFAULT_AI_MODEL);
    expect(body.env.TRAINING_AI_MODEL).toBe(true);
    expect(body.summary.warnings).toBe(0);
    expect(body.ok).toBe(true);
  });

  it('flags a malformed TRAINING_AI_MODEL as a warning with actionable remediation', async () => {
    // Los tres errores de dedo que sí se pueden afirmar sin red: falta el
    // proveedor, hay espacios internos, hay caracteres imposibles en un slug.
    // Ninguno comparte texto con el identificador por defecto, porque la última
    // aserción exige que el valor no aparezca en la respuesta y la remediación
    // sí nombra el defecto como ejemplo.
    const malformedValues = [
      'gpt-4o-mini',
      'openai/gpt 4o mini',
      '${OPENAI_MODEL}',
    ];

    for (const value of malformedValues) {
      process.env.TRAINING_AI_MODEL = value;

      const res = await GET(request(`?orgId=${ORG_ID}`));
      expect(res.status).toBe(200);

      const body = (await res.json()) as DiagnosticsBody;
      const check = findCheck(body, 'env.TRAINING_AI_MODEL');

      expect(check.status, `${value} should be reported as a problem`).toBe(
        'missing',
      );
      // Advertencia, no fallo crítico: rompe todas las rutas de IA y solo esas,
      // el mismo radio que OPENROUTER_API_KEY ausente.
      expect(check.severity).toBe('warning');
      expect(check.remediation).toContain('proveedor/modelo');
      expect(check.remediation).toContain(DEFAULT_AI_MODEL);
      // Distinguible de «no está configurada»: la variable sí está definida.
      expect(check.detail).toContain('definida');

      expect(body.env.TRAINING_AI_MODEL).toBe(false);
      expect(body.summary.warnings).toBe(1);
      expect(body.summary.failed).toBe(0);
      expect(body.ok).toBe(true);

      // Un valor sin forma de identificador puede ser cualquier cosa (incluida
      // una clave pegada en la variable equivocada), así que no se devuelve.
      expect(JSON.stringify(body)).not.toContain(value);
    }
  });
});
