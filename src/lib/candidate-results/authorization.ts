import { z } from 'zod';

/**
 * Autorización de escritura para `candidate_results`.
 *
 * `/api/candidate-results` escribe con la SERVICE ROLE KEY, que **bypassa RLS
 * por diseño**. Eso convierte a la ruta en el único punto donde se puede
 * comprobar qué está permitido escribir: si la ruta no valida, no valida nadie.
 *
 * Este módulo concentra las dos comprobaciones que no dependen de una
 * credencial del candidato:
 *
 *  1. `validateCandidateResultUpdates` — lista blanca de columnas para `PATCH`.
 *  2. `isCandidateResultOwnedBy` — pertenencia de una fila para el `upsert` de
 *     `POST` y para la fila que el `PATCH` va a modificar.
 *
 * La otra mitad de la autorización —la PRUEBA DE ACCESO, que demuestra que quien
 * llama participa en la entrevista— vive en `access-proof.ts` (resolución contra
 * la base) y en `access-proof-contracts.ts` (forma de la credencial en el
 * cuerpo). Este módulo se mantiene puro y sin acceso a la base a propósito: sus
 * dos funciones se pueden probar como funciones y se ejecutan antes de cualquier
 * escritura.
 *
 * Las dos mitades son necesarias y ninguna sustituye a la otra: la prueba de
 * acceso dice de qué entrevista es quien escribe, y la pertenencia dice si la
 * fila que toca es de esa entrevista.
 */

/** Prefijo estable para filtrar los rechazos de autorización en los logs. */
export const PUBLIC_FLOW_AUTH_LOG_PREFIX = '[public-flow-auth]';

/**
 * Estados que el flujo del candidato asigna de verdad.
 *
 * Derivado de `CandidateResult['status']` (`src/types/index.ts`) y de los
 * valores que realmente se envían: `'in-progress'` (InterviewRoom),
 * `'completed'` y `'pending-evaluation'` (InterviewComplete y el reintento
 * manual de `/admin/pipeline`).
 */
export const CANDIDATE_RESULT_STATUSES = [
  'completed',
  'in-progress',
  'pending',
  'pending-evaluation',
] as const;

/**
 * Columnas de `candidate_results` que el flujo del candidato puede parchear.
 *
 * Derivado de las llamadas reales a `patchCandidateResult`, que solo se invoca
 * desde dos sitios de `src/store/adminStore.ts`:
 *
 *  - `updateCandidate` construye `supabaseUpdates` con exactamente estas cinco
 *    columnas: `status`, `evaluation`, `transcript`, `duration`, `video_url`.
 *  - `retrySyncQueue` reenvía los items `candidate_update`, cuyo payload es ese
 *    mismo `supabaseUpdates`.
 *
 * Y `updateCandidate` solo se llama desde `src/components/candidate/InterviewRoom.tsx`
 * (`transcript`, `duration`, `status`), `src/components/candidate/InterviewComplete.tsx`
 * (`status`, `transcript`, `duration`, `videoUrl`, `evaluation`) y
 * `src/app/admin/pipeline/page.tsx` (`status`, `evaluation`).
 *
 * Fuera de la lista quedan a propósito `id`, `org_id`, `role_id`, `source`,
 * `candidate_name`, `candidate_email`, `candidate_phone`, `candidate_linkedin`,
 * `role_title`, `date` y `created_at`: el flujo del candidato no las modifica
 * nunca, y `org_id` / `role_id` / `id` son justo las que permitían mover una
 * fila ajena a otra organización.
 */
export const CANDIDATE_RESULT_PATCHABLE_COLUMNS = [
  'status',
  'evaluation',
  'transcript',
  'duration',
  'video_url',
] as const;

/**
 * Columnas que el `PATCH` rechaza de forma explícita porque su escritura
 * cambia a quién pertenece la fila o de dónde viene.
 */
export const CANDIDATE_RESULT_FORBIDDEN_PATCH_COLUMNS = [
  'id',
  'org_id',
  'role_id',
  'source',
] as const;

/**
 * Esquema de la lista blanca. `.strict()` es la pieza que hace el trabajo:
 * cualquier clave fuera de las cinco permitidas produce `unrecognized_keys`
 * y la petición se rechaza completa, en lugar de descartar la clave en
 * silencio y dejar creer al cliente que se aplicó.
 *
 * Los tipos siguen a la tabla (`src/lib/database.types.ts`), no al tipo de
 * dominio: `duration`, `video_url`, `transcript` y `evaluation` son nulables
 * en la base, así que se aceptan nulos para no romper escrituras legítimas.
 */
export const candidateResultPatchSchema = z
  .object({
    status: z.enum(CANDIDATE_RESULT_STATUSES).optional(),
    evaluation: z.json().optional(),
    transcript: z.array(z.json()).nullable().optional(),
    duration: z.number().int().min(0).nullable().optional(),
    video_url: z.string().max(4096).nullable().optional(),
  })
  .strict();

export type CandidateResultPatch = z.infer<typeof candidateResultPatchSchema>;

export type CandidateResultUpdatesRejection =
  | 'not-an-object'
  | 'empty'
  | 'forbidden-columns'
  | 'unknown-columns'
  | 'invalid-values';

export type CandidateResultUpdatesValidation =
  | { ok: true; updates: CandidateResultPatch }
  | {
      ok: false;
      reason: CandidateResultUpdatesRejection;
      /** Claves del cuerpo que causaron el rechazo. Vienen del propio cliente. */
      rejectedKeys: string[];
      /** Mensaje apto para devolver al cliente: sin datos de otras filas. */
      message: string;
    };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Valida el objeto `updates` de un `PATCH` contra la lista blanca.
 *
 * No toca la base de datos: se ejecuta antes de cualquier escritura, de modo
 * que un rechazo garantiza que no hubo cambios.
 */
export function validateCandidateResultUpdates(
  raw: unknown,
): CandidateResultUpdatesValidation {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      reason: 'not-an-object',
      rejectedKeys: [],
      message: 'updates must be an object',
    };
  }

  const keys = Object.keys(raw);
  if (keys.length === 0) {
    return {
      ok: false,
      reason: 'empty',
      rejectedKeys: [],
      message: 'updates must contain at least one updatable column',
    };
  }

  // Se distinguen las columnas prohibidas de las simplemente desconocidas: son
  // el vector de escalada descrito en el Requisito 3 criterio 8 y conviene
  // poder filtrarlas por separado en los logs.
  const forbidden = keys.filter((key) =>
    (CANDIDATE_RESULT_FORBIDDEN_PATCH_COLUMNS as readonly string[]).includes(key),
  );
  if (forbidden.length > 0) {
    return {
      ok: false,
      reason: 'forbidden-columns',
      rejectedKeys: forbidden,
      message: `updates must not contain: ${forbidden.join(', ')}`,
    };
  }

  const parsed = candidateResultPatchSchema.safeParse(raw);
  if (!parsed.success) {
    const unknownKeys = parsed.error.issues.flatMap((issue) =>
      issue.code === 'unrecognized_keys' ? issue.keys : [],
    );
    if (unknownKeys.length > 0) {
      return {
        ok: false,
        reason: 'unknown-columns',
        rejectedKeys: unknownKeys,
        message: `updates contains columns that the candidate flow never writes: ${unknownKeys.join(', ')}`,
      };
    }
    const invalidKeys = parsed.error.issues.map((issue) => issue.path.join('.'));
    return {
      ok: false,
      reason: 'invalid-values',
      rejectedKeys: invalidKeys,
      message: 'updates contains invalid values',
    };
  }

  return { ok: true, updates: parsed.data };
}

/**
 * Fila existente de `candidate_results` tal como la devuelve la consulta de
 * pertenencia del `POST`.
 */
export interface ExistingCandidateResultOwner {
  role_id: string | null;
  org_id: string | null;
}

/**
 * ¿La fila existente pertenece al mismo rol y a la misma organización que
 * acredita la prueba de acceso?
 *
 * `org_id` nulo se trata como no perteneciente: hay filas heredadas sin
 * organización y aceptarlas dejaría abierta la vía de pisarlas.
 */
export function isCandidateResultOwnedBy(
  existing: ExistingCandidateResultOwner,
  expected: { roleId: string; orgId: string },
): boolean {
  return existing.role_id === expected.roleId && existing.org_id === expected.orgId;
}
