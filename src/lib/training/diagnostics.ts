import 'server-only';

import type { createAdminClient } from '@/utils/supabase/admin';

/**
 * Diagnóstico del entorno de capacitación.
 *
 * Dos estrategias de recolección:
 * - `collectViaRpc`: invoca `public.training_environment_report()` y obtiene
 *   el estado exacto por introspección de catálogos.
 * - `collectViaProbe`: respaldo para el escenario en el que las migraciones
 *   no están aplicadas y, por tanto, la propia función de reporte tampoco
 *   existe. Sondea con consultas ligeras.
 *
 * Ambas producen el mismo tipo `TrainingEnvironmentReport`, que el
 * normalizador convierte en la lista de checks con remediación.
 */

// ============================================================
// 1. TIPOS PÚBLICOS
// ============================================================

export type TrainingAdminClient = ReturnType<typeof createAdminClient>;

/** `unknown` = la estrategia usada no pudo determinar el estado. */
export type TrainingCheckStatus = 'ok' | 'missing' | 'unknown';

export type TrainingCheckSeverity = 'critical' | 'warning';

export type TrainingCheckKind =
  | 'table'
  | 'nullable_column'
  | 'column'
  | 'function'
  | 'bucket'
  | 'bucket_private'
  | 'index'
  | 'env';

export interface TrainingCheckDefinition {
  id: string;
  label: string;
  severity: TrainingCheckSeverity;
  remediation: string;
  kind: TrainingCheckKind;
  /** Clave dentro de la sección correspondiente del reporte. */
  key: string;
}

export interface TrainingCheck extends TrainingCheckDefinition {
  status: TrainingCheckStatus;
  /** Dato adicional no sensible, p. ej. el límite de tamaño del bucket. */
  detail?: string;
}

export interface TrainingBucketReport {
  exists: boolean;
  public: boolean | null;
  file_size_limit: number | null;
}

/**
 * Forma normalizada del reporte.
 * `null` en cualquier valor significa «no se pudo determinar», y se traduce
 * a estado `unknown`, nunca a `missing`.
 */
export interface TrainingEnvironmentReport {
  tables: Record<string, boolean | null>;
  nullable_columns: Record<string, boolean | null>;
  columns: Record<string, boolean | null>;
  functions: Record<string, boolean | null>;
  buckets: Record<string, TrainingBucketReport | null>;
  indexes: Record<string, boolean | null>;
}

export type TrainingDiagnosticsSource = 'rpc' | 'probe';

export interface TrainingEnvironmentCollection {
  source: TrainingDiagnosticsSource;
  report: TrainingEnvironmentReport;
}

export interface TrainingDiagnosticsSummary {
  passed: number;
  failed: number;
  warnings: number;
}

export interface TrainingDiagnosticsResult {
  ok: boolean;
  source: TrainingDiagnosticsSource;
  env: Record<string, boolean>;
  checks: TrainingCheck[];
  summary: TrainingDiagnosticsSummary;
}

// ============================================================
// 2. CATÁLOGO DE CHECKS ESPERADOS
// ============================================================

const MIGRATION_BASE = '20260530_training_center.sql';
const MIGRATION_FOUNDATION = '202607180001_training_v2_foundation.sql';
const MIGRATION_TRANSACTIONS = '202607180002_training_v2_transactions.sql';
const MIGRATION_DETACH_GUARD = '202607180003_training_document_detach_guard.sql';
const MIGRATION_START_MODULE = '202607180004_training_start_module.sql';

function applyMigration(migration: string): string {
  return `Aplicar ${migration}`;
}

export const TRAINING_ENVIRONMENT_REPORT_FUNCTION =
  'training_environment_report';

export const TRAINING_DOCUMENTS_BUCKET = 'training-documents';

/** Tablas que el flujo necesita, con la migración que las provee. */
const TABLE_CHECKS: ReadonlyArray<[string, string]> = [
  ['training_programs', MIGRATION_BASE],
  ['training_documents', MIGRATION_BASE],
  ['training_modules', MIGRATION_BASE],
  ['training_employees', MIGRATION_BASE],
  ['training_progress', MIGRATION_BASE],
  ['training_evaluations', MIGRATION_BASE],
  ['training_sessions', MIGRATION_BASE],
  ['training_program_documents', MIGRATION_FOUNDATION],
  ['training_module_documents', MIGRATION_FOUNDATION],
  ['training_document_chunks', MIGRATION_FOUNDATION],
  ['training_access_sessions', MIGRATION_FOUNDATION],
];

/**
 * Columnas que deben admitir NULL. En el esquema base son NOT NULL y solo
 * `202607180001` les quita la restricción; sin eso, cada inserción falla.
 */
const NULLABLE_COLUMN_CHECKS: ReadonlyArray<[string, string]> = [
  ['training_documents.program_id', MIGRATION_FOUNDATION],
  ['training_documents.file_url', MIGRATION_FOUNDATION],
  ['training_employees.token', MIGRATION_FOUNDATION],
];

/** Columnas de las que solo se verifica la presencia. */
const PRESENT_COLUMN_CHECKS: ReadonlyArray<[string, string]> = [
  ['training_employees.user_id', MIGRATION_BASE],
];

/**
 * Funciones de Postgres de las que dependen las rutas de API.
 * La lista es exactamente el conjunto de RPC que el código invoca; si falta
 * cualquiera de ellas, el flujo de capacitación se rompe.
 */
const FUNCTION_CHECKS: ReadonlyArray<[string, string]> = [
  ['is_training_admin', MIGRATION_FOUNDATION],
  ['calculate_training_progress', MIGRATION_BASE],
  ['hire_training_candidate', MIGRATION_TRANSACTIONS],
  ['publish_training_program', MIGRATION_TRANSACTIONS],
  ['create_training_program', MIGRATION_TRANSACTIONS],
  ['create_training_program_version', MIGRATION_TRANSACTIONS],
  ['replace_training_modules', MIGRATION_TRANSACTIONS],
  ['finalize_training_evaluation', MIGRATION_TRANSACTIONS],
  ['complete_training_module_without_evaluation', MIGRATION_TRANSACTIONS],
  ['increment_training_time', MIGRATION_TRANSACTIONS],
  ['append_training_session_messages', MIGRATION_TRANSACTIONS],
  ['detach_training_program_document', MIGRATION_DETACH_GUARD],
  ['start_training_module', MIGRATION_START_MODULE],
];

/** Índices relevantes para las reglas de publicación. */
const INDEX_CHECKS: ReadonlyArray<[string, string]> = [
  ['uniq_published_training_program_per_role', MIGRATION_FOUNDATION],
];

export const TRAINING_ENVIRONMENT_TABLES: readonly string[] =
  TABLE_CHECKS.map(([name]) => name);

export const TRAINING_ENVIRONMENT_FUNCTIONS: readonly string[] =
  FUNCTION_CHECKS.map(([name]) => name);

export const TRAINING_ENVIRONMENT_NULLABLE_COLUMNS: readonly string[] =
  NULLABLE_COLUMN_CHECKS.map(([name]) => name);

export const TRAINING_ENVIRONMENT_PRESENT_COLUMNS: readonly string[] =
  PRESENT_COLUMN_CHECKS.map(([name]) => name);

export const TRAINING_ENVIRONMENT_INDEXES: readonly string[] =
  INDEX_CHECKS.map(([name]) => name);

/**
 * Catálogo de checks del esquema. El orden es el orden de presentación.
 * La existencia del bucket es `critical`; que sea privado es `warning`,
 * porque un bucket público no impide el flujo, solo lo expone.
 */
export const TRAINING_SCHEMA_CHECKS: readonly TrainingCheckDefinition[] = [
  ...TABLE_CHECKS.map<TrainingCheckDefinition>(([name, migration]) => ({
    id: `table.${name}`,
    label: `Tabla ${name}`,
    severity: 'critical',
    remediation: applyMigration(migration),
    kind: 'table',
    key: name,
  })),

  ...NULLABLE_COLUMN_CHECKS.map<TrainingCheckDefinition>(
    ([name, migration]) => ({
      id: `column.nullable.${name}`,
      label: `Columna ${name} admite NULL`,
      severity: 'critical',
      remediation: applyMigration(migration),
      kind: 'nullable_column',
      key: name,
    }),
  ),

  ...PRESENT_COLUMN_CHECKS.map<TrainingCheckDefinition>(
    ([name, migration]) => ({
      id: `column.present.${name}`,
      label: `Columna ${name}`,
      severity: 'critical',
      remediation: applyMigration(migration),
      kind: 'column',
      key: name,
    }),
  ),

  ...FUNCTION_CHECKS.map<TrainingCheckDefinition>(([name, migration]) => ({
    id: `function.${name}`,
    label: `Función ${name}`,
    severity: 'critical',
    remediation: applyMigration(migration),
    kind: 'function',
    key: name,
  })),

  {
    id: `storage.bucket.${TRAINING_DOCUMENTS_BUCKET}`,
    label: `Bucket de storage ${TRAINING_DOCUMENTS_BUCKET}`,
    severity: 'critical',
    remediation: applyMigration(MIGRATION_FOUNDATION),
    kind: 'bucket',
    key: TRAINING_DOCUMENTS_BUCKET,
  },
  {
    id: `storage.bucket.${TRAINING_DOCUMENTS_BUCKET}.private`,
    label: `Bucket ${TRAINING_DOCUMENTS_BUCKET} es privado`,
    severity: 'warning',
    remediation: applyMigration(MIGRATION_FOUNDATION),
    kind: 'bucket_private',
    key: TRAINING_DOCUMENTS_BUCKET,
  },

  ...INDEX_CHECKS.map<TrainingCheckDefinition>(([name, migration]) => ({
    id: `index.${name}`,
    label: `Índice ${name}`,
    severity: 'warning',
    remediation: applyMigration(migration),
    kind: 'index',
    key: name,
  })),
];

// ============================================================
// 3. VARIABLES DE ENTORNO
// ============================================================

/**
 * Solo se comprueba la presencia. El valor NUNCA se lee para la respuesta,
 * para no filtrar claves al cliente.
 */
export const TRAINING_ENV_CHECKS: readonly TrainingCheckDefinition[] = [
  {
    id: 'env.NEXT_PUBLIC_SUPABASE_URL',
    label: 'Variable NEXT_PUBLIC_SUPABASE_URL',
    severity: 'critical',
    remediation: 'Definir NEXT_PUBLIC_SUPABASE_URL en el entorno del despliegue',
    kind: 'env',
    key: 'NEXT_PUBLIC_SUPABASE_URL',
  },
  {
    id: 'env.NEXT_PUBLIC_SUPABASE_ANON_KEY',
    label: 'Variable NEXT_PUBLIC_SUPABASE_ANON_KEY',
    severity: 'critical',
    remediation:
      'Definir NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno del despliegue',
    kind: 'env',
    key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  },
  {
    id: 'env.SUPABASE_SERVICE_ROLE_KEY',
    label: 'Variable SUPABASE_SERVICE_ROLE_KEY',
    severity: 'critical',
    remediation:
      'Definir SUPABASE_SERVICE_ROLE_KEY en el entorno del despliegue',
    kind: 'env',
    key: 'SUPABASE_SERVICE_ROLE_KEY',
  },
  {
    // Degradación aceptada por los Requisitos 3.7 y 10.3: sin la clave el
    // flujo continúa sin resumen ni calificación de preguntas abiertas.
    id: 'env.OPENROUTER_API_KEY',
    label: 'Variable OPENROUTER_API_KEY',
    severity: 'warning',
    remediation:
      'Definir OPENROUTER_API_KEY para habilitar el análisis con IA; sin ella el flujo continúa degradado',
    kind: 'env',
    key: 'OPENROUTER_API_KEY',
  },
];

function isEnvVariablePresent(name: string): boolean {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
}

/** Presencia de variables de entorno, sin exponer ningún valor. */
export function collectEnvPresence(): Record<string, boolean> {
  const env: Record<string, boolean> = {};

  for (const check of TRAINING_ENV_CHECKS) {
    env[check.key] = isEnvVariablePresent(check.key);
  }

  return env;
}

export function buildEnvChecks(
  env: Record<string, boolean> = collectEnvPresence(),
): TrainingCheck[] {
  return TRAINING_ENV_CHECKS.map(definition => ({
    ...definition,
    status: env[definition.key] ? 'ok' : 'missing',
  }));
}

// ============================================================
// 4. UTILIDADES DE ERROR
// ============================================================

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const code = (error as { code?: unknown }).code;

  return typeof code === 'string' ? code : null;
}

function readErrorMessage(error: unknown): string {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object') {
    const message = (error as { message?: unknown }).message;

    if (typeof message === 'string') {
      return message;
    }
  }

  return '';
}

/** `42P01` (undefined_table) o el equivalente de PostgREST. */
export function isMissingRelationError(error: unknown): boolean {
  const code = readErrorCode(error);

  if (code === '42P01' || code === 'PGRST205') {
    return true;
  }

  const message = readErrorMessage(error).toLowerCase();

  return (
    message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('no existe')
  );
}

/** `42703` (undefined_column) o el equivalente de PostgREST. */
function isMissingColumnError(error: unknown): boolean {
  const code = readErrorCode(error);

  if (code === '42703' || code === 'PGRST204') {
    return true;
  }

  const message = readErrorMessage(error).toLowerCase();

  return message.includes('column') && message.includes('does not exist');
}

/**
 * `42883` (undefined_function) o `PGRST202` (no está en el esquema expuesto).
 * Cualquier otro error significa que la función existe y rechazó la llamada,
 * que es exactamente la señal que busca el sondeo.
 */
export function isMissingFunctionError(error: unknown): boolean {
  const code = readErrorCode(error);

  if (code === '42883' || code === 'PGRST202') {
    return true;
  }

  const message = readErrorMessage(error).toLowerCase();

  return (
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist'))
  );
}

// ============================================================
// 5. RECOLECCIÓN VÍA RPC
// ============================================================

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asBooleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pickBooleanMap(
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, boolean | null> {
  const result: Record<string, boolean | null> = {};

  for (const key of keys) {
    result[key] = asBooleanOrNull(source[key]);
  }

  return result;
}

function parseBucketReport(value: unknown): TrainingBucketReport | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = asRecord(value);
  const exists = asBooleanOrNull(raw.exists);

  if (exists === null) {
    return null;
  }

  return {
    exists,
    public: asBooleanOrNull(raw.public),
    file_size_limit: asNumberOrNull(raw.file_size_limit),
  };
}

/**
 * Normaliza el JSONB de `training_environment_report()` a la forma interna,
 * tolerando claves ausentes para no romperse si la función es más antigua.
 */
export function parseEnvironmentReport(
  raw: unknown,
): TrainingEnvironmentReport {
  const root = asRecord(raw);
  const buckets = asRecord(root.buckets);

  return {
    tables: pickBooleanMap(
      asRecord(root.tables),
      TRAINING_ENVIRONMENT_TABLES,
    ),
    nullable_columns: pickBooleanMap(
      asRecord(root.nullable_columns),
      TRAINING_ENVIRONMENT_NULLABLE_COLUMNS,
    ),
    columns: pickBooleanMap(
      asRecord(root.columns),
      TRAINING_ENVIRONMENT_PRESENT_COLUMNS,
    ),
    functions: pickBooleanMap(
      asRecord(root.functions),
      TRAINING_ENVIRONMENT_FUNCTIONS,
    ),
    buckets: {
      [TRAINING_DOCUMENTS_BUCKET]: parseBucketReport(
        buckets[TRAINING_DOCUMENTS_BUCKET],
      ),
    },
    indexes: pickBooleanMap(
      asRecord(root.indexes),
      TRAINING_ENVIRONMENT_INDEXES,
    ),
  };
}

/**
 * Camino preferente. Devuelve `null` cuando la propia función de reporte no
 * existe, para que quien llame pueda caer al sondeo.
 * Cualquier otro error se propaga.
 */
export async function collectViaRpc(
  admin: TrainingAdminClient,
): Promise<TrainingEnvironmentCollection | null> {
  const { data, error } = await admin.rpc(
    TRAINING_ENVIRONMENT_REPORT_FUNCTION,
  );

  if (error) {
    if (isMissingFunctionError(error)) {
      return null;
    }

    throw error;
  }

  return {
    source: 'rpc',
    report: parseEnvironmentReport(data),
  };
}

// ============================================================
// 6. RECOLECCIÓN VÍA SONDEO (RESPALDO)
// ============================================================

/**
 * LIMITACIÓN DEL SONDEO
 *
 * El cliente JS no puede leer `information_schema` ni `pg_indexes`, así que
 * el sondeo NO puede determinar:
 * - la nulabilidad de una columna (`nullable_columns`)
 * - la presencia de un índice (`indexes`)
 *
 * Esos checks quedan en estado `unknown`, nunca `missing`, y no invalidan
 * `ok`. Para conocerlos hay que aplicar la migración del reporte
 * (202607280001) y volver a diagnosticar por RPC.
 */
async function probeTable(
  admin: TrainingAdminClient,
  table: string,
): Promise<boolean | null> {
  try {
    const { error } = await admin
      .from(table)
      .select('*', { head: true, count: 'exact' })
      .limit(0);

    if (!error) {
      return true;
    }

    if (isMissingRelationError(error)) {
      return false;
    }

    // Error de otra naturaleza (permisos, red): no concluyente.
    return null;
  } catch {
    return null;
  }
}

async function probeColumn(
  admin: TrainingAdminClient,
  table: string,
  column: string,
): Promise<boolean | null> {
  try {
    const { error } = await admin
      .from(table)
      .select(column, { head: true, count: 'exact' })
      .limit(0);

    if (!error) {
      return true;
    }

    if (isMissingColumnError(error)) {
      return false;
    }

    // Si falta la tabla entera, el check de tabla ya lo reporta.
    return null;
  } catch {
    return null;
  }
}

async function probeFunction(
  admin: TrainingAdminClient,
  name: string,
): Promise<boolean | null> {
  try {
    // Se invoca con argumentos vacíos a propósito: si la función existe,
    // fallará por argumentos o por precondición, y ese fallo la confirma.
    const { error } = await admin.rpc(name, {});

    if (!error) {
      return true;
    }

    return !isMissingFunctionError(error);
  } catch (error) {
    return !isMissingFunctionError(error);
  }
}

async function probeBucket(
  admin: TrainingAdminClient,
  bucketId: string,
): Promise<TrainingBucketReport | null> {
  try {
    const { data, error } = await admin.storage.listBuckets();

    if (error || !data) {
      return null;
    }

    const bucket = data.find(
      candidate => candidate.id === bucketId || candidate.name === bucketId,
    );

    if (!bucket) {
      return { exists: false, public: null, file_size_limit: null };
    }

    const raw = bucket as {
      public?: unknown;
      file_size_limit?: unknown;
    };

    return {
      exists: true,
      public: asBooleanOrNull(raw.public),
      file_size_limit: asNumberOrNull(raw.file_size_limit),
    };
  } catch {
    return null;
  }
}

/**
 * Camino de respaldo para una base sin las migraciones aplicadas, donde
 * `training_environment_report()` tampoco existe.
 */
export async function collectViaProbe(
  admin: TrainingAdminClient,
): Promise<TrainingEnvironmentCollection> {
  const tables: Record<string, boolean | null> = {};

  for (const table of TRAINING_ENVIRONMENT_TABLES) {
    tables[table] = await probeTable(admin, table);
  }

  const columns: Record<string, boolean | null> = {};

  for (const qualified of TRAINING_ENVIRONMENT_PRESENT_COLUMNS) {
    const [table, column] = qualified.split('.');
    columns[qualified] =
      tables[table] === false ? null : await probeColumn(admin, table, column);
  }

  const functions: Record<string, boolean | null> = {};

  for (const name of TRAINING_ENVIRONMENT_FUNCTIONS) {
    functions[name] = await probeFunction(admin, name);
  }

  // No determinables por sondeo: quedan en `unknown`.
  const nullableColumns: Record<string, boolean | null> = {};

  for (const qualified of TRAINING_ENVIRONMENT_NULLABLE_COLUMNS) {
    nullableColumns[qualified] = null;
  }

  const indexes: Record<string, boolean | null> = {};

  for (const name of TRAINING_ENVIRONMENT_INDEXES) {
    indexes[name] = null;
  }

  return {
    source: 'probe',
    report: {
      tables,
      nullable_columns: nullableColumns,
      columns,
      functions,
      buckets: {
        [TRAINING_DOCUMENTS_BUCKET]: await probeBucket(
          admin,
          TRAINING_DOCUMENTS_BUCKET,
        ),
      },
      indexes,
    },
  };
}

/** RPC con respaldo automático al sondeo. */
export async function collectTrainingEnvironment(
  admin: TrainingAdminClient,
): Promise<TrainingEnvironmentCollection> {
  try {
    const viaRpc = await collectViaRpc(admin);

    if (viaRpc) {
      return viaRpc;
    }
  } catch (error) {
    console.error(
      '[training/diagnostics] training_environment_report() failed, falling back to probe:',
      error,
    );
  }

  return collectViaProbe(admin);
}

// ============================================================
// 7. NORMALIZADOR
// ============================================================

function statusFromFlag(flag: boolean | null | undefined): TrainingCheckStatus {
  if (flag === true) {
    return 'ok';
  }

  if (flag === false) {
    return 'missing';
  }

  return 'unknown';
}

function formatFileSizeLimit(limit: number | null): string | undefined {
  if (limit === null) {
    return undefined;
  }

  const megabytes = limit / (1024 * 1024);

  return `Límite de archivo: ${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function resolveSchemaCheck(
  definition: TrainingCheckDefinition,
  report: TrainingEnvironmentReport,
): TrainingCheck {
  switch (definition.kind) {
    case 'table':
      return {
        ...definition,
        status: statusFromFlag(report.tables[definition.key]),
      };

    case 'nullable_column':
      return {
        ...definition,
        status: statusFromFlag(report.nullable_columns[definition.key]),
      };

    case 'column':
      return {
        ...definition,
        status: statusFromFlag(report.columns[definition.key]),
      };

    case 'function':
      return {
        ...definition,
        status: statusFromFlag(report.functions[definition.key]),
      };

    case 'bucket': {
      const bucket = report.buckets[definition.key] ?? null;

      return {
        ...definition,
        status: statusFromFlag(bucket === null ? null : bucket.exists),
        detail: bucket?.exists
          ? formatFileSizeLimit(bucket.file_size_limit)
          : undefined,
      };
    }

    case 'bucket_private': {
      const bucket = report.buckets[definition.key] ?? null;

      // Si el bucket no existe o no se pudo leer, la privacidad no es
      // concluyente; el check de existencia ya reporta el problema.
      const status: TrainingCheckStatus =
        bucket === null || !bucket.exists
          ? 'unknown'
          : statusFromFlag(
              bucket.public === null ? null : bucket.public === false,
            );

      return { ...definition, status };
    }

    case 'index':
      return {
        ...definition,
        status: statusFromFlag(report.indexes[definition.key]),
      };

    default:
      return { ...definition, status: 'unknown' };
  }
}

/** Checks del esquema, en el orden del catálogo. */
export function buildSchemaChecks(
  report: TrainingEnvironmentReport,
): TrainingCheck[] {
  return TRAINING_SCHEMA_CHECKS.map(definition =>
    resolveSchemaCheck(definition, report),
  );
}

/**
 * `passed` cuenta los checks en `ok`; `failed`, los `critical` en `missing`;
 * `warnings`, los `warning` en `missing`. Los `unknown` no se cuentan en
 * ninguno, así que la suma puede ser menor que el total de checks cuando el
 * diagnóstico viene del sondeo.
 */
export function summarizeTrainingChecks(
  checks: readonly TrainingCheck[],
): TrainingDiagnosticsSummary {
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const check of checks) {
    if (check.status === 'ok') {
      passed += 1;
      continue;
    }

    if (check.status !== 'missing') {
      continue;
    }

    if (check.severity === 'critical') {
      failed += 1;
    } else {
      warnings += 1;
    }
  }

  return { passed, failed, warnings };
}

/** `ok` solo si ningún check `critical` está en `missing`. Los `unknown` no lo invalidan. */
export function isTrainingEnvironmentOk(
  checks: readonly TrainingCheck[],
): boolean {
  return !checks.some(
    check => check.severity === 'critical' && check.status === 'missing',
  );
}

/** Resultado completo: esquema más variables de entorno. */
export function buildTrainingDiagnostics(
  collection: TrainingEnvironmentCollection,
  env: Record<string, boolean> = collectEnvPresence(),
): TrainingDiagnosticsResult {
  const checks = [
    ...buildSchemaChecks(collection.report),
    ...buildEnvChecks(env),
  ];

  return {
    ok: isTrainingEnvironmentOk(checks),
    source: collection.source,
    env,
    checks,
    summary: summarizeTrainingChecks(checks),
  };
}
