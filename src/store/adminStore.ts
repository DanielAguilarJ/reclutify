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
    topics: role.topics,
    created_at: new Date(role.createdAt).toISOString(),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (row.topics as any) || [],
    createdAt: new Date(row.created_at as string).getTime(),
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

        if (rolesError && process.env.NODE_ENV === 'development') {
          console.error('Error cargando roles:', rolesError);
        }

        // Cargar resultados de candidatos
        const { data: candidatesData, error: candError } = await supabase
          .from('candidate_results')
          .select('*')
          .eq('org_id', orgId)
          .order('date', { ascending: false });

        if (candError && process.env.NODE_ENV === 'development') {
          console.error('Error cargando candidatos:', candError);
        }

        set({
          roles: rolesData ? rolesData.map(roleFromSupabase) : [],
          candidates: candidatesData ? candidatesData.map(candidateFromSupabase) : [],
          loading: false,
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error en fetchFromSupabase:', err);
        }
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

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error guardando rol en Supabase:', error);
          }
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error sincronizando rol:', err);
          }
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
          if (updates.topics !== undefined) supabaseUpdates.topics = updates.topics;

          const { error } = await supabase
            .from('roles')
            .update(supabaseUpdates)
            .eq('id', id);

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error actualizando rol en Supabase:', error);
          }
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error sincronizando actualización de rol:', err);
          }
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

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error eliminando rol en Supabase:', error);
          }
        } catch (err) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error sincronizando eliminación de rol:', err);
          }
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

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error guardando candidato en Supabase:', error);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando candidato:', err);
        }
      }
    },

    // ─── Actualizar candidato: Supabase + store local ───
    updateCandidate: async (id: string, updates: Partial<CandidateResult>) => {
      set((state: AdminState) => ({
        candidates: state.candidates.map((c) =>
          c.id === id ? { ...c, ...updates } : c
        ),
      }));

      try {
        const supabase = createClient();
        // Construir actualizaciones para Supabase
        const supabaseUpdates: Record<string, unknown> = {};
        if (updates.status !== undefined) supabaseUpdates.status = updates.status;
        if (updates.evaluation !== undefined) supabaseUpdates.evaluation = updates.evaluation;
        if (updates.transcript !== undefined) supabaseUpdates.transcript = updates.transcript;
        if (updates.duration !== undefined) supabaseUpdates.duration = updates.duration;
        if (updates.videoUrl !== undefined) supabaseUpdates.video_url = updates.videoUrl;

        if (Object.keys(supabaseUpdates).length > 0) {
          const { error } = await supabase
            .from('candidate_results')
            .update(supabaseUpdates)
            .eq('id', id);

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error actualizando candidato en Supabase:', error);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando actualización de candidato:', err);
        }
      }
    },
  })
);
