import { create } from 'zustand';
import type { Role, CandidateResult } from '@/types';
import { createClient } from '@/utils/supabase/client';

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
  addRole: (role: Role) => Promise<void>;
  updateRole: (id: string, updates: Partial<Role>) => Promise<void>;
  removeRole: (id: string) => Promise<void>;

  // Acciones de candidatos
  addCandidate: (candidate: CandidateResult) => Promise<void>;
  updateCandidate: (id: string, updates: Partial<CandidateResult>) => Promise<void>;

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
    topics: role.topics,
    created_at: new Date(role.createdAt).toISOString(),
    is_published: role.isPublished ?? false,
    published_at: role.publishedAt ? new Date(role.publishedAt).toISOString() : null,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (row.topics as any) || [],
    createdAt: new Date(row.created_at as string).getTime(),
    isPublished: (row.is_published as boolean) ?? false,
    publishedAt: row.published_at ? new Date(row.published_at as string).getTime() : undefined,
    publicToken: (row.public_token as string) || undefined,
  };
}

/**
 * Helper: Convierte un CandidateResult al formato de Supabase
 */
function candidateToSupabase(c: CandidateResult, orgId: string) {
  return {
    id: c.id,
    org_id: orgId,
    candidate_name: c.candidate.name,
    candidate_email: c.candidate.email,
    candidate_phone: c.candidate.phone,
    candidate_linkedin: c.candidate.linkedinUrl || '',
    role_id: c.roleId,
    role_title: c.roleTitle,
    date: c.date,
    status: c.status,
    duration: c.duration || 0,
    video_url: c.videoUrl || null,
    evaluation: c.evaluation || null,
    transcript: c.transcript || [],
    source: c.source || 'ticket',
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
      email: (row.candidate_email as string) || '',
      phone: (row.candidate_phone as string) || '',
      linkedinUrl: (row.candidate_linkedin as string) || undefined,
    },
    roleId: row.role_id as string,
    roleTitle: row.role_title as string,
    date: row.date as number,
    status: (row.status as CandidateResult['status']) || 'pending',
    duration: (row.duration as number) || undefined,
    videoUrl: (row.video_url as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluation: (row.evaluation as any) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcript: (row.transcript as any) || [],
    source: (row.source as 'ticket' | 'public_link') || 'ticket',
  };
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
const SYNC_QUEUE_KEY = 'reclutify_sync_queue';
const SYNC_QUEUE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 días
const SYNC_QUEUE_MAX_ITEMS = 200; // cota dura para evitar crecimiento indefinido

interface SyncQueueItem {
  id: string; // id de la entrada en la cola (no el id del candidato)
  kind: 'candidate_update' | 'candidate_upsert_with_org' | 'candidate_upsert_needs_org';
  candidateId: string;
  // candidate_update: Partial<CandidateResult> en formato Supabase (columnas)
  // candidate_upsert_with_org: fila completa en formato Supabase (de candidateToSupabase)
  // candidate_upsert_needs_org: CandidateResult crudo (aún sin orgId resuelto)
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

function readSyncQueue(): SyncQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch (err) {
    console.error('[AdminStore] No se pudo leer la cola de sincronización:', err);
    return [];
  }
}

function writeSyncQueue(queue: SyncQueueItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('[AdminStore] No se pudo persistir la cola de sincronización:', err);
  }
}

function pushToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'createdAt' | 'attempts'>): number {
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
export const useAdminStore = create<AdminState>()(
  (set, get) => ({
    roles: [] as Role[],
    candidates: [] as CandidateResult[],
    orgId: null as string | null,
    loading: false as boolean,
    error: null as string | null,
    pendingSyncCount: typeof window !== 'undefined' ? readSyncQueue().length : 0,

    setOrgId: (orgId: string) => set({ orgId }),

    // ─── Cargar datos desde Supabase ───
    fetchFromSupabase: async () => {
      set({ loading: true, error: null });
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          set({ loading: false });
          return;
        }

        // Obtener el org_id del perfil del usuario
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.org_id) {
          set({ loading: false });
          return;
        }

        const orgId = profile.org_id;
        set({ orgId });

        // Cargar roles de la organización
        const { data: rolesData, error: rolesError } = await supabase
          .from('roles')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });

        if (rolesError) {
          console.error('[AdminStore] Error cargando roles:', rolesError);
        }

        // Cargar resultados de candidatos
        const { data: candidatesData, error: candError } = await supabase
          .from('candidate_results')
          .select('*')
          .eq('org_id', orgId)
          .order('date', { ascending: false });

        if (candError) {
          console.error('[AdminStore] Error cargando candidatos:', candError);
        }

        set({
          roles: rolesData ? rolesData.map(roleFromSupabase) : [],
          candidates: candidatesData ? candidatesData.map(candidateFromSupabase) : [],
          loading: false,
        });

        // Best-effort: replay any writes that failed to sync in a previous session
        // from this same browser. Fire-and-forget — never blocks the dashboard load.
        get().retrySyncQueue().catch((err) => {
          console.error('[AdminStore] retrySyncQueue (auto) failed:', err);
        });
      } catch (err) {
        console.error('[AdminStore] Error en fetchFromSupabase:', err);
        set({ error: 'Error cargando datos', loading: false });
      }
    },

    // ─── Agregar rol: Supabase + store local ───
    addRole: async (role: Role) => {
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
            .from('roles')
            .upsert(roleToSupabase(role, orgId));

          if (error) {
            console.error('[AdminStore] Error guardando rol en Supabase:', error);
          }
        } catch (err) {
          console.error('[AdminStore] Error sincronizando rol:', err);
        }
      }
    },

    // ─── Actualizar rol: Supabase + store local ───
    updateRole: async (id: string, updates: Partial<Role>) => {
      set((state: AdminState) => ({
        roles: state.roles.map((r) =>
          r.id === id ? { ...r, ...updates } : r
        ),
      }));

      const orgId = get().orgId;
      if (orgId) {
        try {
          const supabase = createClient();
          // Construir objeto de actualización para Supabase
          const supabaseUpdates: Record<string, unknown> = {};
          if (updates.title !== undefined) supabaseUpdates.title = updates.title;
          if (updates.description !== undefined) supabaseUpdates.description = updates.description;
          if (updates.location !== undefined) supabaseUpdates.location = updates.location;
          if (updates.salary !== undefined) supabaseUpdates.salary = updates.salary;
          if (updates.jobType !== undefined) supabaseUpdates.job_type = updates.jobType;
          if (updates.interviewDuration !== undefined) supabaseUpdates.interview_duration = updates.interviewDuration;
          if (updates.topics !== undefined) supabaseUpdates.topics = updates.topics;
          if (updates.isPublished !== undefined) supabaseUpdates.is_published = updates.isPublished;
          if (updates.publishedAt !== undefined) supabaseUpdates.published_at = updates.publishedAt ? new Date(updates.publishedAt).toISOString() : null;

          const { error } = await supabase
            .from('roles')
            .update(supabaseUpdates)
            .eq('id', id);

          if (error) {
            console.error('[AdminStore] Error actualizando rol en Supabase:', error);
          }
        } catch (err) {
          console.error('[AdminStore] Error sincronizando actualización de rol:', err);
        }
      }
    },

    // ─── Eliminar rol: Supabase + store local ───
    removeRole: async (id: string) => {
      set((state: AdminState) => ({
        roles: state.roles.filter((r) => r.id !== id),
      }));

      const orgId = get().orgId;
      if (orgId) {
        try {
          const supabase = createClient();
          const { error } = await supabase
            .from('roles')
            .delete()
            .eq('id', id);

          if (error) {
            console.error('[AdminStore] Error eliminando rol en Supabase:', error);
          }
        } catch (err) {
          console.error('[AdminStore] Error sincronizando eliminación de rol:', err);
        }
      }
    },

    // ─── Agregar candidato: Supabase + store local ───
    addCandidate: async (candidate: CandidateResult) => {
      set((state: AdminState) => ({
        candidates: [candidate, ...state.candidates],
      }));

      // Sincronizar con Supabase — funciona con o sin orgId
      // (candidatos sin autenticar también insertan resultados)
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const supabase = createClient();
          const orgId = get().orgId;

          // Intentar obtener orgId del rol si no lo tenemos
          let effectiveOrgId = orgId;
          if (!effectiveOrgId) {
            const { data: roleData } = await supabase
              .from('roles')
              .select('org_id')
              .eq('id', candidate.roleId)
              .single();
            effectiveOrgId = roleData?.org_id || null;
          }

          if (effectiveOrgId) {
            const { error } = await supabase
              .from('candidate_results')
              .upsert(candidateToSupabase(candidate, effectiveOrgId));

            if (error) {
              console.error(`[AdminStore] addCandidate attempt ${attempt}/${maxRetries} failed:`, error);
              if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, attempt * 2000));
                continue;
              }
              // Persist for automatic retry (see retrySyncQueue) instead of a
              // localStorage key nothing ever reads back.
              const queueLen = pushToSyncQueue({
                kind: 'candidate_upsert_with_org',
                candidateId: candidate.id,
                payload: candidateToSupabase(candidate, effectiveOrgId),
                lastError: error.message,
              });
              set({ pendingSyncCount: queueLen });
            }
            break; // Success or final failure — exit loop
          } else {
            // Without orgId we cannot insert — queue it so retrySyncQueue can
            // re-resolve the orgId (via candidate.roleId) once it's available.
            console.warn('[AdminStore] addCandidate: no orgId found for roleId:', candidate.roleId);
            const queueLen = pushToSyncQueue({
              kind: 'candidate_upsert_needs_org',
              candidateId: candidate.id,
              payload: candidate,
              lastError: 'No orgId resolved for roleId at insert time',
            });
            set({ pendingSyncCount: queueLen });
            break; // No point retrying without orgId right now
          }
        } catch (err) {
          console.error(`[AdminStore] addCandidate attempt ${attempt}/${maxRetries} exception:`, err);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 2000));
          } else {
            // Final attempt threw (e.g. network down) — queue for automatic retry.
            const orgId = get().orgId;
            const queueLen = orgId
              ? pushToSyncQueue({
                  kind: 'candidate_upsert_with_org',
                  candidateId: candidate.id,
                  payload: candidateToSupabase(candidate, orgId),
                  lastError: String(err),
                })
              : pushToSyncQueue({
                  kind: 'candidate_upsert_needs_org',
                  candidateId: candidate.id,
                  payload: candidate,
                  lastError: String(err),
                });
            set({ pendingSyncCount: queueLen });
          }
        }
      }
    },

    // ─── Actualizar candidato: Supabase + store local ───
    updateCandidate: async (id: string, updates: Partial<CandidateResult>) => {
      // Optimistic update — local state updates immediately
      set((state: AdminState) => ({
        candidates: state.candidates.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));

      // Construir actualizaciones para Supabase
      const supabaseUpdates: Record<string, unknown> = {};
      if (updates.status !== undefined) supabaseUpdates.status = updates.status;
      if (updates.evaluation !== undefined) supabaseUpdates.evaluation = updates.evaluation;
      if (updates.transcript !== undefined) supabaseUpdates.transcript = updates.transcript;
      if (updates.duration !== undefined) supabaseUpdates.duration = updates.duration;
      if (updates.videoUrl !== undefined) supabaseUpdates.video_url = updates.videoUrl;

      if (Object.keys(supabaseUpdates).length === 0) return;

      // Retry with exponential backoff — 3 attempts
      const maxRetries = 3;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const supabase = createClient();
          const { error } = await supabase
            .from('candidate_results')
            .update(supabaseUpdates)
            .eq('id', id);

          if (error) {
            console.error(`[AdminStore] updateCandidate attempt ${attempt}/${maxRetries} failed:`, error);
            if (attempt < maxRetries) {
              await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s backoff
              continue;
            }
            // After all retries failed — queue for automatic retry (see retrySyncQueue)
            // instead of a localStorage key that nothing ever read back.
            const queueLen = pushToSyncQueue({
              kind: 'candidate_update',
              candidateId: id,
              payload: supabaseUpdates,
              lastError: error.message,
            });
            set({ pendingSyncCount: queueLen });
            return; // Don't throw — optimistic update already applied
          }

          break; // Success — exit retry loop
        } catch (err) {
          console.error(`[AdminStore] updateCandidate attempt ${attempt}/${maxRetries} exception:`, err);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 2000));
          } else {
            // Final attempt failed — queue for automatic retry (see retrySyncQueue)
            const queueLen = pushToSyncQueue({
              kind: 'candidate_update',
              candidateId: id,
              payload: supabaseUpdates,
              lastError: String(err),
            });
            set({ pendingSyncCount: queueLen });
          }
        }
      }
    },

    // ─── Reintentar cola de sincronización fallida ───
    retrySyncQueue: async () => {
      let queue = readSyncQueue();
      if (queue.length === 0) {
        set({ pendingSyncCount: 0 });
        return;
      }

      // Drop stale entries — unlikely to still be relevant, and keeps the queue bounded.
      const now = Date.now();
      const beforeAge = queue.length;
      queue = queue.filter((item) => now - item.createdAt < SYNC_QUEUE_MAX_AGE_MS);
      if (queue.length !== beforeAge) {
        console.warn(
          `[AdminStore] retrySyncQueue: dropped ${beforeAge - queue.length} item(s) older than 14 days`
        );
      }
      // Hard cap to prevent unbounded localStorage growth if Supabase is down for a long time.
      if (queue.length > SYNC_QUEUE_MAX_ITEMS) {
        console.warn(
          `[AdminStore] retrySyncQueue: queue exceeded ${SYNC_QUEUE_MAX_ITEMS} items — dropping oldest`
        );
        queue = queue.slice(queue.length - SYNC_QUEUE_MAX_ITEMS);
      }

      const supabase = createClient();
      const remaining: SyncQueueItem[] = [];

      for (const item of queue) {
        try {
          if (item.kind === 'candidate_update') {
            const { error } = await supabase
              .from('candidate_results')
              .update(item.payload as Record<string, unknown>)
              .eq('id', item.candidateId);
            if (error) throw error;
          } else if (item.kind === 'candidate_upsert_with_org') {
            const { error } = await supabase
              .from('candidate_results')
              .upsert(item.payload as Record<string, unknown>);
            if (error) throw error;
          } else {
            // candidate_upsert_needs_org — try to resolve the orgId again before upserting.
            const candidate = item.payload as CandidateResult;
            let effectiveOrgId = get().orgId;
            if (!effectiveOrgId) {
              const { data: roleData } = await supabase
                .from('roles')
                .select('org_id')
                .eq('id', candidate.roleId)
                .single();
              effectiveOrgId = roleData?.org_id || null;
            }
            if (!effectiveOrgId) {
              throw new Error('orgId still unresolved for roleId ' + candidate.roleId);
            }
            const { error } = await supabase
              .from('candidate_results')
              .upsert(candidateToSupabase(candidate, effectiveOrgId));
            if (error) throw error;
          }
          console.log(`[AdminStore] retrySyncQueue: item ${item.id} synced successfully`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[AdminStore] retrySyncQueue: item ${item.id} failed again:`, message);
          remaining.push({ ...item, attempts: item.attempts + 1, lastError: message });
        }
      }

      writeSyncQueue(remaining);
      set({ pendingSyncCount: remaining.length });
      // NOTE: no need to re-fetch from Supabase here — the local `candidates`/`roles`
      // state already reflects these writes via the optimistic updates that queued
      // them in the first place. This also avoids a retrySyncQueue <-> fetchFromSupabase
      // call cycle (fetchFromSupabase triggers an automatic retrySyncQueue on load).
    },
  })
);
