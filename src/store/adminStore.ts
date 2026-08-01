import { create } from "zustand";
import { z } from "zod";

import type { Role, CandidateResult, InterviewMode } from "@/types";
import { accessProofRequestFields } from "@/lib/candidate-results/access-proof-contracts";
import { useInterviewStore } from "@/store/interviewStore";
import { createClient } from "@/utils/supabase/client";

// ─── Tipos de estado del store ───
interface AdminState {
  // Datos principales
  roles: Role[];
  candidates: CandidateResult[];
  orgId: string | null;

  // Estados de carga
  loading: boolean;
  error: string | null;

  // Acciones de roles
  /**
   * Crea un puesto. Devuelve `false` si no llegó a la base.
   *
   * Devolvía `void`, y eso tenía consecuencias más allá del propio store: `create-role` lo espera
   * y a continuación construye el enlace público y crea un ticket por candidato. Si el puesto no
   * se persistió, esos tickets apuntan a un id que no existe y la pantalla dice «¡Puesto Creado!».
   * La reversión local evita mostrar un puesto fantasma, pero no basta: quien llama necesita
   * saberlo para no seguir construyendo cosas encima.
   */
  addRole: (role: Role) => Promise<boolean>;
  updateRole: (id: string, updates: Partial<Role>) => Promise<void>;
  removeRole: (id: string) => Promise<void>;

  // Acciones de candidatos
  addCandidate: (candidate: CandidateResult) => Promise<void>;
  updateCandidate: (
    id: string,
    updates: Partial<CandidateResult>,
  ) => Promise<void>;

  // Sincronización con Supabase
  fetchFromSupabase: () => Promise<void>;
  setOrgId: (orgId: string) => void;

  // ─── Sync Queue (ver comentario junto a SYNC_QUEUE_KEY más abajo) ───
  // Número de escrituras a Supabase que fallaron y quedaron encoladas para reintento.
  pendingSyncCount: number;
  // Reintenta todos los items encolados. Se llama automáticamente tras un
  // fetchFromSupabase() exitoso, y puede llamarse manualmente (botón "Reintentar").
  retrySyncQueue: () => Promise<void>;
}

/**
 * Helper: Convierte un rol del formato de la app al formato de Supabase
 */
function roleToSupabase(role: Role, orgId: string) {
  return {
    id: role.id,
    org_id: orgId,
    title: role.title,
    description: role.description || null,
    location: role.location || null,
    salary: role.salary || null,
    job_type: role.jobType || null,
    interview_duration: role.interviewDuration ?? 30,
    interview_mode: role.interviewMode || 'restricted',
    topics: role.topics,
    created_at: new Date(role.createdAt).toISOString(),
    is_published: role.isPublished ?? false,
    published_at: role.publishedAt
      ? new Date(role.publishedAt).toISOString()
      : null,
    public_token: role.publicToken || null,
  };
}

/**
 * Helper: Convierte un rol de Supabase al formato de la app
 */
function roleFromSupabase(row: Record<string, unknown>): Role {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    location: (row.location as string) || undefined,
    salary: (row.salary as string) || undefined,
    jobType: (row.job_type as string) || undefined,
    interviewDuration: (row.interview_duration as number) ?? 30,
    interviewMode: ((row.interview_mode as string) || 'restricted') as InterviewMode,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (row.topics as any) || [],
    createdAt: new Date(row.created_at as string).getTime(),
    isPublished: (row.is_published as boolean) ?? false,
    publishedAt: row.published_at
      ? new Date(row.published_at as string).getTime()
      : undefined,
    publicToken: (row.public_token as string) || undefined,
  };
}

/**
 * Helper: Convierte un CandidateResult de Supabase al formato de la app
 */
function candidateFromSupabase(row: Record<string, unknown>): CandidateResult {
  return {
    id: row.id as string,
    candidate: {
      name: row.candidate_name as string,
      email: (row.candidate_email as string) || "",
      phone: (row.candidate_phone as string) || "",
      linkedinUrl: (row.candidate_linkedin as string) || undefined,
    },
    roleId: row.role_id as string,
    roleTitle: row.role_title as string,
    date: row.date as number,
    status: (row.status as CandidateResult["status"]) || "pending",
    duration: (row.duration as number) || undefined,
    videoUrl: (row.video_url as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluation: (row.evaluation as any) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcript: (row.transcript as any) || [],
    source: (row.source as "ticket" | "public_link") || "ticket",
  };
}

/**
 * Prueba de acceso que acompaña a cada escritura de `candidate_results`.
 *
 * `/api/candidate-results` ya no acepta escrituras sin credencial. Se lee del
 * store de la entrevista EN EL MOMENTO de cada petición —no al construir el
 * store— para que valga igual en la escritura inmediata y en los reintentos de
 * `retrySyncQueue`, que ocurren más tarde.
 *
 * Cuando no hay ninguna (el camino del panel: `/admin/pipeline` llama a
 * `updateCandidate` sin token de candidato) el objeto va vacío y la credencial
 * pasa a ser la sesión de Supabase, que `fetch` envía en las cookies al ser una
 * petición al mismo origen.
 */
function accessProofFields(): Record<string, string> {
  return accessProofRequestFields(useInterviewStore.getState().accessProof);
}

/**
 * Helper: hace POST a /api/candidate-results (upsert de fila completa).
 * Esta ruta usa la SERVICE ROLE KEY en el servidor y por lo tanto bypassa
 * RLS — necesario porque los candidatos que toman la entrevista NUNCA
 * tienen una sesión autenticada de Supabase, y depender de políticas RLS
 * de `anon` para esta escritura es justo lo que causaba los 401 (42501)
 * "new row violates row-level security policy for table candidate_results".
 */
async function upsertCandidateResult(params: {
  id: string;
  roleId: string;
  orgId?: string | null;
  candidateName: string;
  candidateEmail?: string;
  candidatePhone?: string;
  candidateLinkedin?: string;
  roleTitle: string;
  date: number;
  status: string;
  duration?: number;
  videoUrl?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  evaluation?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transcript?: any;
  source?: string;
}): Promise<{ orgId?: string }> {
  const res = await fetch("/api/candidate-results", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...params, ...accessProofFields() }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(errBody.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * Helper: hace PATCH a /api/candidate-results (actualización parcial por id).
 * Mismo motivo que upsertCandidateResult — bypassa RLS vía service role.
 */
async function patchCandidateResult(
  id: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const res = await fetch("/api/candidate-results", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, updates, ...accessProofFields() }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(errBody.error || `HTTP ${res.status}`);
  }
}

/**
 * ─── Sync Queue: cola de reintento respaldada por localStorage ───
 *
 * Esta es la ÚNICA excepción deliberada a la regla "sin localStorage" del store
 * (ver comentario debajo). Su propósito es acotado: si una escritura a Supabase
 * falla después de 3 reintentos (blip de red, hiccup de RLS, caída temporal),
 * NO queremos perder silenciosamente los datos del candidato — el escenario que
 * causaba que reclutadores no vieran métricas de candidatos que sí completaron
 * la entrevista.
 *
 * Los items fallidos se encolan aquí y se reintentan automáticamente:
 *   1. Cada vez que este navegador carga con éxito el dashboard de admin
 *      (ver el final de fetchFromSupabase), y
 *   2. Manualmente, vía retrySyncQueue() (botón "Reintentar sincronización").
 *
 * IMPORTANTE: esto NO resuelve sincronización cross-device de verdad — la cola
 * vive en el navegador que presenció el fallo. Pero es una mejora real sobre
 * perder la escritura por completo, y pendingSyncCount se expone para que la UI
 * avise al admin cuando la sincronización está incompleta, en vez de fallar en
 * silencio como antes.
 */
const SYNC_QUEUE_KEY = "reclutify_sync_queue";
const SYNC_QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 días
const SYNC_QUEUE_MAX_ITEMS = 200; // cota dura para evitar crecimiento indefinido

/**
 * Intentos antes de descartar una entrada.
 *
 * El campo `attempts` ya se incrementaba y se guardaba, pero NO SE LEÍA PARA NADA. La única
 * evicción era por antigüedad (14 días) o por la cota de 200, así que una entrada que falla
 * siempre —un rol borrado, un candidato que el servidor rechaza con 4xx— se reintentaba en cada
 * carga del panel durante dos semanas. La reintención tiene sentido contra fallos de red, que son
 * transitorios; contra un 4xx es una petición inútil repetida indefinidamente.
 */
const SYNC_QUEUE_MAX_ATTEMPTS = 8;

interface SyncQueueItem {
  id: string; // id de la entrada en la cola (no el id del candidato)
  kind:
    | "candidate_update"
    | "candidate_upsert_with_org"
    | "candidate_upsert_needs_org";
  candidateId: string;
  // candidate_update: Partial<CandidateResult> en formato Supabase (columnas)
  // candidate_upsert_with_org: fila completa en formato Supabase (de candidateToSupabase)
  // candidate_upsert_needs_org: CandidateResult crudo (aún sin orgId resuelto)
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

/**
 * Validación de lo que sale de `localStorage`.
 *
 * Antes era `JSON.parse(raw) as SyncQueueItem[]`, un `as` sin comprobar nada. `localStorage` es
 * almacenamiento del cliente: lo escribe una versión anterior del código, lo edita quien quiera
 * abrir las herramientas de desarrollo, y sobrevive a los despliegues. Un JSON válido con forma
 * distinta pasaba el `as` sin ruido y luego `item.kind` no casaba con ninguna rama conocida, así
 * que caía en el `else` —`candidate_upsert_needs_org`— y se enviaba basura al endpoint.
 *
 * Las entradas que no validan se descartan al leer, que es el único momento en que se puede
 * distinguir «dato corrupto» de «dato que el servidor rechaza».
 */
const syncQueueItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    "candidate_update",
    "candidate_upsert_with_org",
    "candidate_upsert_needs_org",
  ]),
  candidateId: z.string(),
  payload: z.unknown(),
  createdAt: z.number().finite(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
});

function readSyncQueue(): SyncQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(
        "[AdminStore] la cola de sincronización no era un array — se descarta",
      );
      return [];
    }

    const valid: SyncQueueItem[] = [];
    let discarded = 0;
    for (const entry of parsed) {
      const item = syncQueueItemSchema.safeParse(entry);
      if (item.success) valid.push(item.data as SyncQueueItem);
      else discarded += 1;
    }

    if (discarded > 0) {
      console.warn(
        `[AdminStore] se descartaron ${discarded} entrada(s) de la cola con forma inesperada`,
      );
    }

    return valid;
  } catch (err) {
    console.error(
      "[AdminStore] No se pudo leer la cola de sincronización:",
      err,
    );
    return [];
  }
}

function writeSyncQueue(queue: SyncQueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error(
      "[AdminStore] No se pudo persistir la cola de sincronización:",
      err,
    );
  }
}

/**
 * Escribe el resultado de un reintento SIN pisar lo que se encoló mientras corría.
 *
 * `retrySyncQueue` leía la cola al empezar, recorría las entradas con un `await` por cada una, y
 * al final hacía `writeSyncQueue(remaining)`. Cualquier `pushToSyncQueue` que ocurriera durante
 * esos `await` —y ocurre: `addCandidate` encola justo cuando agota sus tres reintentos, que es
 * cuando la red va mal, que es cuando el reintento está corriendo— quedaba sobrescrito.
 *
 * La cola cuya única razón de existir es no perder datos del candidato los perdía.
 *
 * Se vuelve a leer antes de escribir y se conservan las entradas que no estaban en la instantánea
 * procesada. Las que sí estaban ya están decididas: sincronizadas, descartadas o en `remaining`.
 *
 * @param processedIds Ids de la instantánea que este reintento procesó.
 * @param remaining Entradas que fallaron y siguen mereciendo otro intento.
 * @returns Longitud final de la cola, para `pendingSyncCount`.
 */
function commitSyncQueueAfterRetry(
  processedIds: ReadonlySet<string>,
  remaining: readonly SyncQueueItem[],
): number {
  const addedDuringRetry = readSyncQueue().filter(
    (item) => !processedIds.has(item.id),
  );

  if (addedDuringRetry.length > 0) {
    console.warn(
      `[AdminStore] retrySyncQueue: se conservan ${addedDuringRetry.length} entrada(s) encoladas durante el reintento`,
    );
  }

  const next = [...remaining, ...addedDuringRetry];
  writeSyncQueue(next);
  return next.length;
}

/**
 * Reintento en vuelo, para que dos llamadas no se solapen.
 *
 * `fetchFromSupabase` dispara `retrySyncQueue` al terminar, así que dos navegaciones seguidas al
 * panel lanzaban dos recorridos concurrentes sobre la misma cola: ambos reenviaban las mismas
 * entradas y el segundo pisaba el resultado del primero. Vive fuera del store porque es un
 * detalle del módulo, no estado que la interfaz deba ver.
 */
let retryInFlight: Promise<void> | null = null;

/**
 * Mensaje para cuando una escritura optimista de rol no llega a la base.
 *
 * Las tres acciones de rol aplicaban el cambio en local, fallaban contra Supabase, lo registraban
 * en consola y dejaban el estado divergente sin revertir ni avisar. `removeRole` era el peor: el
 * puesto desaparecía de la pantalla y seguía existiendo —y publicado— en la base, así que el admin
 * creía haberlo retirado y los candidatos seguían pudiendo entrar.
 *
 * `addRole` tampoco era inocuo: `create-role` espera a `addRole` y a continuación crea tickets
 * contra ese id, así que los tickets apuntaban a un puesto inexistente.
 */
/** Devuelve un rol a su versión previa. Si no había previa, lo saca de la lista. */
function revertRole(
  set: (fn: (state: AdminState) => Partial<AdminState>) => void,
  id: string,
  previous: Role | undefined,
): void {
  set((state: AdminState) => ({
    roles: previous
      ? state.roles.map((r) => (r.id === id ? previous : r))
      : state.roles.filter((r) => r.id !== id),
    error: ROLE_SYNC_ERROR,
  }));
}

/** Reinserta un rol cuyo borrado falló, en la posición que ocupaba. */
function restoreRemovedRole(
  set: (fn: (state: AdminState) => Partial<AdminState>) => void,
  removed: Role | undefined,
  index: number,
  message: string = ROLE_SYNC_ERROR,
): void {
  if (!removed) {
    set(() => ({ error: message }));
    return;
  }

  set((state: AdminState) => {
    // Si otra escritura ya lo repuso, no se duplica.
    if (state.roles.some((r) => r.id === removed.id)) {
      return { error: message };
    }

    const roles = [...state.roles];
    roles.splice(Math.max(0, Math.min(index, roles.length)), 0, removed);
    return { roles, error: message };
  });
}

const ROLE_SYNC_ERROR = "No se pudo guardar el cambio del puesto. Se ha deshecho para no mostrar algo distinto de lo guardado.";

/**
 * Mensaje para cuando el borrado de un puesto choca con `candidates.role_id`.
 *
 * `candidates.role_id → roles` se declaró `ON DELETE RESTRICT` (migración
 * `202608040002`): un candidato es historial de contratación y no debe desaparecer
 * en cascada solo porque se borró la vacante. Postgres devuelve el código `23503`
 * cuando el borrado choca con esa restricción — sin este mensaje, `ROLE_SYNC_ERROR`
 * habría dicho «no se pudo guardar el cambio», que no explica qué hacer para
 * conseguirlo.
 */
const ROLE_HAS_CANDIDATES_ERROR =
  "No se puede eliminar este puesto: tiene candidatos con entrevista registrada. Publícalo como cerrado en vez de borrarlo si quieres retirarlo de las vacantes activas.";

/** Código de Postgres para violación de clave foránea (`23503`). */
const FOREIGN_KEY_VIOLATION_CODE = "23503";

function pushToSyncQueue(
  item: Omit<SyncQueueItem, "id" | "createdAt" | "attempts">,
): number {
  const queue = readSyncQueue();
  queue.push({
    ...item,
    id: `${item.kind}-${item.candidateId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0,
  });
  writeSyncQueue(queue);
  return queue.length;
}

/**
 * Store de administración — caché en memoria con Supabase como fuente de verdad.
 * SIN persistencia en localStorage para garantizar sincronización cross-device
 * (con la única excepción, acotada, de la Sync Queue documentada arriba).
 */
export const useAdminStore = create<AdminState>()((set, get) => ({
  roles: [] as Role[],
  candidates: [] as CandidateResult[],
  orgId: null as string | null,
  loading: false as boolean,
  error: null as string | null,
  pendingSyncCount: typeof window !== "undefined" ? readSyncQueue().length : 0,

  setOrgId: (orgId: string) => set({ orgId }),

  // ─── Cargar datos desde Supabase ───
  fetchFromSupabase: async () => {
    set({ loading: true, error: null });
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        set({ loading: false });
        return;
      }

      // Obtener el org_id del perfil del usuario
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("org_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.org_id) {
        set({ loading: false });
        return;
      }

      const orgId = profile.org_id;
      set({ orgId });

      // Cargar roles de la organización
      const { data: rolesData, error: rolesError } = await supabase
        .from("roles")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (rolesError) {
        console.error("[AdminStore] Error cargando roles:", rolesError);
      }

      // Cargar resultados de candidatos
      const { data: candidatesData, error: candError } = await supabase
        .from("candidate_results")
        .select("*")
        .eq("org_id", orgId)
        .order("date", { ascending: false });

      if (candError) {
        console.error("[AdminStore] Error cargando candidatos:", candError);
      }

      set({
        roles: rolesData ? rolesData.map(roleFromSupabase) : [],
        candidates: candidatesData
          ? candidatesData.map(candidateFromSupabase)
          : [],
        loading: false,
      });

      // Best-effort: replay any writes that failed to sync in a previous session
      // from this same browser. Fire-and-forget — never blocks the dashboard load.
      get()
        .retrySyncQueue()
        .catch((err) => {
          console.error("[AdminStore] retrySyncQueue (auto) failed:", err);
        });
    } catch (err) {
      console.error("[AdminStore] Error en fetchFromSupabase:", err);
      set({ error: "Error cargando datos", loading: false });
    }
  },

  // ─── Agregar rol: Supabase + store local ───
  addRole: async (role: Role): Promise<boolean> => {
    // Actualizar estado local inmediatamente (optimistic update)
    set((state: AdminState) => ({
      roles: [role, ...state.roles],
    }));

    // Sincronizar con Supabase en segundo plano
    const orgId = get().orgId;
    if (orgId) {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from("roles")
          .upsert(roleToSupabase(role, orgId));

        if (error) {
          console.error("[AdminStore] Error guardando rol en Supabase:", error);
          // Reversión quirúrgica: se quita ESE rol en lugar de restaurar el array completo, que
          // descartaría cualquier otro cambio ocurrido durante la petición.
          set((state: AdminState) => ({
            roles: state.roles.filter((r) => r.id !== role.id),
            error: ROLE_SYNC_ERROR,
          }));
          return false;
        }
      } catch (err) {
        console.error("[AdminStore] Error sincronizando rol:", err);
        set((state: AdminState) => ({
          roles: state.roles.filter((r) => r.id !== role.id),
          error: ROLE_SYNC_ERROR,
        }));
        return false;
      }
    }

    // Sin `orgId` no hay a dónde escribir. Se devuelve `true` porque el puesto sí quedó en el
    // estado local y ese es el comportamiento que ya tenía: el flujo sin organización resuelta es
    // el de una sesión a medio cargar, no un fallo de escritura.
    return true;
  },

  // ─── Actualizar rol: Supabase + store local ───
  updateRole: async (id: string, updates: Partial<Role>) => {
    // Versión previa de ESTE rol, para poder deshacer solo lo que se cambió.
    const previous = get().roles.find((r) => r.id === id);

    set((state: AdminState) => ({
      roles: state.roles.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    }));

    const orgId = get().orgId;
    if (orgId) {
      try {
        const supabase = createClient();
        // Construir objeto de actualización para Supabase
        const supabaseUpdates: Record<string, unknown> = {};
        if (updates.title !== undefined) supabaseUpdates.title = updates.title;
        if (updates.description !== undefined)
          supabaseUpdates.description = updates.description;
        if (updates.location !== undefined)
          supabaseUpdates.location = updates.location;
        if (updates.salary !== undefined)
          supabaseUpdates.salary = updates.salary;
        if (updates.jobType !== undefined)
          supabaseUpdates.job_type = updates.jobType;
        if (updates.interviewDuration !== undefined)
          supabaseUpdates.interview_duration = updates.interviewDuration;
        if (updates.interviewMode !== undefined)
          supabaseUpdates.interview_mode = updates.interviewMode;
        if (updates.topics !== undefined)
          supabaseUpdates.topics = updates.topics;
        if (updates.isPublished !== undefined)
          supabaseUpdates.is_published = updates.isPublished;
        if (updates.publishedAt !== undefined)
          supabaseUpdates.published_at = updates.publishedAt
            ? new Date(updates.publishedAt).toISOString()
            : null;

        const { error } = await supabase
          .from("roles")
          .update(supabaseUpdates)
          .eq("id", id);

        if (error) {
          console.error(
            "[AdminStore] Error actualizando rol en Supabase:",
            error,
          );
          revertRole(set, id, previous);
        }
      } catch (err) {
        console.error(
          "[AdminStore] Error sincronizando actualización de rol:",
          err,
        );
        revertRole(set, id, previous);
      }
    }
  },

  // ─── Eliminar rol: Supabase + store local ───
  removeRole: async (id: string) => {
    // Se guarda el rol Y su posición para devolverlo a su sitio si el borrado no cuaja: la lista
    // está ordenada por fecha de creación y reinsertar al principio la desordenaría.
    const roles = get().roles;
    const removedIndex = roles.findIndex((r) => r.id === id);
    const removed = removedIndex >= 0 ? roles[removedIndex] : undefined;

    set((state: AdminState) => ({
      roles: state.roles.filter((r) => r.id !== id),
    }));

    const orgId = get().orgId;
    if (orgId) {
      try {
        const supabase = createClient();
        const { error } = await supabase.from("roles").delete().eq("id", id);

        if (error) {
          console.error(
            "[AdminStore] Error eliminando rol en Supabase:",
            error,
          );
          // `23503` es el código de Postgres para violación de clave foránea. Desde la
          // migración `202608040002`, `candidates.role_id → roles` es `ON DELETE RESTRICT`:
          // un candidato con entrevista registrada bloquea el borrado del puesto a propósito,
          // en vez de desaparecer en cascada. Sin esta comprobación, el admin veía el mensaje
          // genérico «no se pudo guardar el cambio», que no dice qué hacer para conseguirlo.
          restoreRemovedRole(
            set,
            removed,
            removedIndex,
            error.code === FOREIGN_KEY_VIOLATION_CODE ? ROLE_HAS_CANDIDATES_ERROR : undefined,
          );
        }
      } catch (err) {
        console.error(
          "[AdminStore] Error sincronizando eliminación de rol:",
          err,
        );
        restoreRemovedRole(set, removed, removedIndex);
      }
    }
  },

  // ─── Agregar candidato: server-side (service role) + store local ───
  addCandidate: async (candidate: CandidateResult) => {
    set((state: AdminState) => ({
      candidates: [candidate, ...state.candidates],
    }));

    // Sincronizar vía /api/candidate-results (service role, bypassa RLS) —
    // funciona con o sin orgId (candidatos sin autenticar también insertan
    // resultados; el org_id se resuelve server-side a partir del roleId).
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const orgId = get().orgId;
        const { orgId: resolvedOrgId } = await upsertCandidateResult({
          id: candidate.id,
          roleId: candidate.roleId,
          orgId: orgId || undefined,
          candidateName: candidate.candidate.name,
          candidateEmail: candidate.candidate.email,
          candidatePhone: candidate.candidate.phone,
          candidateLinkedin: candidate.candidate.linkedinUrl || "",
          roleTitle: candidate.roleTitle,
          date: candidate.date,
          status: candidate.status,
          duration: candidate.duration || 0,
          videoUrl: candidate.videoUrl || null,
          evaluation: candidate.evaluation || null,
          transcript: candidate.transcript || [],
          source: candidate.source || "ticket",
        });

        // Cachear el orgId resuelto para futuras escrituras de esta sesión
        if (resolvedOrgId && !get().orgId) {
          set({ orgId: resolvedOrgId });
        }

        break; // Success — exit retry loop
      } catch (err) {
        console.error(
          `[AdminStore] addCandidate attempt ${attempt}/${maxRetries} failed:`,
          err,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 2000));
          continue;
        }
        // Final attempt failed — queue for automatic retry (see retrySyncQueue)
        // instead of a localStorage key nothing ever reads back.
        const queueLen = pushToSyncQueue({
          kind: "candidate_upsert_needs_org",
          candidateId: candidate.id,
          payload: candidate,
          lastError: String(err),
        });
        set({ pendingSyncCount: queueLen });
      }
    }
  },

  // ─── Actualizar candidato: server-side (service role) + store local ───
  updateCandidate: async (id: string, updates: Partial<CandidateResult>) => {
    // Optimistic update — local state updates immediately
    set((state: AdminState) => ({
      candidates: state.candidates.map((c) =>
        c.id === id ? { ...c, ...updates } : c,
      ),
    }));

    // Construir actualizaciones para Supabase
    const supabaseUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) supabaseUpdates.status = updates.status;
    if (updates.evaluation !== undefined)
      supabaseUpdates.evaluation = updates.evaluation;
    if (updates.transcript !== undefined)
      supabaseUpdates.transcript = updates.transcript;
    if (updates.duration !== undefined)
      supabaseUpdates.duration = updates.duration;
    if (updates.videoUrl !== undefined)
      supabaseUpdates.video_url = updates.videoUrl;

    if (Object.keys(supabaseUpdates).length === 0) return;

    // Retry with exponential backoff — 3 attempts
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await patchCandidateResult(id, supabaseUpdates);
        break; // Success — exit retry loop
      } catch (err) {
        console.error(
          `[AdminStore] updateCandidate attempt ${attempt}/${maxRetries} failed:`,
          err,
        );
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, attempt * 2000)); // 2s, 4s backoff
          continue;
        }
        // Final attempt failed — queue for automatic retry (see retrySyncQueue)
        // instead of a localStorage key that nothing ever read back.
        const queueLen = pushToSyncQueue({
          kind: "candidate_update",
          candidateId: id,
          payload: supabaseUpdates,
          lastError: String(err),
        });
        set({ pendingSyncCount: queueLen });
      }
    }
  },

  // ─── Reintentar cola de sincronización fallida ───
  retrySyncQueue: async () => {
    // Si ya hay un reintento corriendo se espera a ese en lugar de lanzar otro: la cola es
    // compartida y dos recorridos concurrentes se pisan el resultado.
    if (retryInFlight) {
      await retryInFlight;
      return;
    }

    let releaseInFlight: () => void = () => {};
    retryInFlight = new Promise<void>((resolve) => {
      releaseInFlight = resolve;
    });

    try {
      await runSyncQueueRetry(set, get);
    } finally {
      releaseInFlight();
      retryInFlight = null;
    }
  },
}));

/**
 * Cuerpo del reintento de la cola.
 *
 * Está fuera del `create()` para que la acción se quede solo con el control de concurrencia y se
 * lea de un vistazo que no hay ningún camino que se salte el `finally`.
 */
async function runSyncQueueRetry(
  set: (partial: Partial<AdminState>) => void,
  get: () => AdminState,
): Promise<void> {
    let queue = readSyncQueue();
    if (queue.length === 0) {
      set({ pendingSyncCount: 0 });
      return;
    }

    // Ids de TODO lo leído, incluidas las entradas que se descarten a continuación: son las que
    // este recorrido da por decididas. Lo que aparezca en la cola y no esté aquí se encoló
    // mientras corría el reintento y hay que conservarlo.
    const processedIds = new Set(queue.map((item) => item.id));

    // Drop stale entries — unlikely to still be relevant, and keeps the queue bounded.
    const now = Date.now();
    const beforeAge = queue.length;
    queue = queue.filter(
      (item) => now - item.createdAt < SYNC_QUEUE_MAX_AGE_MS,
    );
    if (queue.length !== beforeAge) {
      console.warn(
        `[AdminStore] retrySyncQueue: dropped ${beforeAge - queue.length} item(s) older than 14 days`,
      );
    }
    // Hard cap to prevent unbounded localStorage growth if Supabase is down for a long time.
    if (queue.length > SYNC_QUEUE_MAX_ITEMS) {
      console.warn(
        `[AdminStore] retrySyncQueue: queue exceeded ${SYNC_QUEUE_MAX_ITEMS} items — dropping oldest`,
      );
      queue = queue.slice(queue.length - SYNC_QUEUE_MAX_ITEMS);
    }

    const remaining: SyncQueueItem[] = [];

    for (const item of queue) {
      try {
        if (item.kind === "candidate_update") {
          await patchCandidateResult(
            item.candidateId,
            item.payload as Record<string, unknown>,
          );
        } else if (item.kind === "candidate_upsert_with_org") {
          const payload = item.payload as Record<string, unknown>;
          await upsertCandidateResult({
            id: payload.id as string,
            roleId: payload.role_id as string,
            orgId: payload.org_id as string,
            candidateName: payload.candidate_name as string,
            candidateEmail: payload.candidate_email as string,
            candidatePhone: payload.candidate_phone as string,
            candidateLinkedin: payload.candidate_linkedin as string,
            roleTitle: payload.role_title as string,
            date: payload.date as number,
            status: payload.status as string,
            duration: payload.duration as number,
            videoUrl: payload.video_url as string | null,
            evaluation: payload.evaluation,
            transcript: payload.transcript,
            source: payload.source as string,
          });
        } else {
          // candidate_upsert_needs_org — el endpoint resuelve el orgId
          // server-side a partir del roleId, así que basta con reenviar
          // el CandidateResult crudo.
          const candidate = item.payload as CandidateResult;
          const { orgId: resolvedOrgId } = await upsertCandidateResult({
            id: candidate.id,
            roleId: candidate.roleId,
            orgId: get().orgId || undefined,
            candidateName: candidate.candidate.name,
            candidateEmail: candidate.candidate.email,
            candidatePhone: candidate.candidate.phone,
            candidateLinkedin: candidate.candidate.linkedinUrl || "",
            roleTitle: candidate.roleTitle,
            date: candidate.date,
            status: candidate.status,
            duration: candidate.duration || 0,
            videoUrl: candidate.videoUrl || null,
            evaluation: candidate.evaluation || null,
            transcript: candidate.transcript || [],
            source: candidate.source || "ticket",
          });
          if (resolvedOrgId && !get().orgId) {
            set({ orgId: resolvedOrgId });
          }
        }
        console.log(
          `[AdminStore] retrySyncQueue: item ${item.id} synced successfully`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[AdminStore] retrySyncQueue: item ${item.id} failed again:`,
          message,
        );
        const attempts = item.attempts + 1;

        if (attempts >= SYNC_QUEUE_MAX_ATTEMPTS) {
          // Ocho fallos seguidos no son un problema de red. Se descarta con el motivo a la vista,
          // en lugar de reintentarlo en cada carga del panel durante catorce días.
          console.error(
            `[AdminStore] retrySyncQueue: item ${item.id} descartado tras ${attempts} intentos. Último error: ${message}`,
          );
          continue;
        }

        remaining.push({ ...item, attempts, lastError: message });
      }
    }

    set({ pendingSyncCount: commitSyncQueueAfterRetry(processedIds, remaining) });
    // NOTE: no need to re-fetch from Supabase here — the local `candidates`/`roles`
    // state already reflects these writes via the optimistic updates that queued
    // them in the first place. This also avoids a retrySyncQueue <-> fetchFromSupabase
    // call cycle (fetchFromSupabase triggers an automatic retrySyncQueue on load).
}
