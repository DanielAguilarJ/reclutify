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
 * Store de administración — caché en memoria con Supabase como fuente de verdad.
 * SIN persistencia en localStorage para garantizar sincronización cross-device.
 */
export const useAdminStore = create<AdminState>()(
  (set, get) => ({
    roles: [] as Role[],
    candidates: [] as CandidateResult[],
    orgId: null as string | null,
    loading: false as boolean,
    error: null as string | null,

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
              // Persist for manual retry
              try {
                const failedInserts = JSON.parse(localStorage.getItem('reclutify_failed_inserts') || '[]');
                failedInserts.push({ candidate, orgId: effectiveOrgId, timestamp: Date.now(), error: error.message });
                localStorage.setItem('reclutify_failed_inserts', JSON.stringify(failedInserts));
              } catch (storageErr) {
                console.error('[AdminStore] Could not persist failed insert to localStorage:', storageErr);
              }
            }
            break; // Success or final failure — exit loop
          } else {
            // Without orgId we cannot insert — persist for retry when orgId becomes available
            console.warn('[AdminStore] addCandidate: no orgId found for roleId:', candidate.roleId);
            try {
              const pendingInserts = JSON.parse(localStorage.getItem('reclutify_pending_inserts') || '[]');
              pendingInserts.push({ candidate, timestamp: Date.now() });
              localStorage.setItem('reclutify_pending_inserts', JSON.stringify(pendingInserts));
            } catch (storageErr) {
              console.error('[AdminStore] Could not persist pending insert to localStorage:', storageErr);
            }
            break; // No point retrying without orgId
          }
        } catch (err) {
          console.error(`[AdminStore] addCandidate attempt ${attempt}/${maxRetries} exception:`, err);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 2000));
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
            // After all retries failed — persist to localStorage for manual retry
            try {
              const failedUpdates = JSON.parse(localStorage.getItem('reclutify_failed_updates') || '[]');
              failedUpdates.push({ id, updates: supabaseUpdates, timestamp: Date.now(), error: error.message });
              localStorage.setItem('reclutify_failed_updates', JSON.stringify(failedUpdates));
            } catch (storageErr) {
              // localStorage may be unavailable — log but don't crash
              console.error('[AdminStore] Could not persist failed update to localStorage:', storageErr);
            }
            return; // Don't throw — optimistic update already applied
          }

          break; // Success — exit retry loop
        } catch (err) {
          console.error(`[AdminStore] updateCandidate attempt ${attempt}/${maxRetries} exception:`, err);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, attempt * 2000));
          } else {
            // Final attempt failed — persist for retry
            try {
              const failedUpdates = JSON.parse(localStorage.getItem('reclutify_failed_updates') || '[]');
              failedUpdates.push({ id, updates: supabaseUpdates, timestamp: Date.now(), error: String(err) });
              localStorage.setItem('reclutify_failed_updates', JSON.stringify(failedUpdates));
            } catch (storageErr) {
              console.error('[AdminStore] Could not persist failed update to localStorage:', storageErr);
            }
          }
        }
      }
    },
  })
);
