import { create } from 'zustand';
import type {
  TrainingProgram,
  TrainingProgramStatus,
  TrainingDocument,
  TrainingDocumentStatus,
  TrainingModule,
  TrainingEmployee,
  TrainingProgress,
  TrainingDocumentTopic,
  TrainingModuleSection,
  TrainingQuestionAdmin,
} from '@/types';
import { createClient } from '@/utils/supabase/client';

// ─── Tipos de estado del store ───
interface TrainingAdminState {
  programs: TrainingProgram[];
  documents: TrainingDocument[];
  modules: TrainingModule[];
  employees: TrainingEmployee[];
  loading: boolean;
  error: string | null;

  fetchTrainingData: () => Promise<void>;
  setError: (error: string | null) => void;

  createProgram: (program: {
    roleId: string;
    title: string;
    description?: string;
    welcomeMessage?: string;
    aiPersonality: string;
  }) => Promise<TrainingProgram | null>;
  updateProgram: (id: string, updates: Partial<TrainingProgram>) => Promise<boolean>;

  addDocument: (doc: TrainingDocument) => void;
  detachDocumentFromProgram: (programId: string, docId: string) => Promise<boolean>;

  setModules: (modules: TrainingModule[]) => void;
  addModule: (programId: string, module: Omit<TrainingModule, 'id' | 'programId' | 'createdAt' | 'updatedAt' | 'sortOrder'>) => Promise<TrainingModule | null>;
  updateModule: (programId: string, moduleId: string, updates: Partial<TrainingModule>) => Promise<boolean>;
  removeModule: (programId: string, moduleId: string) => Promise<boolean>;
  reorderModules: (programId: string, moduleIds: string[]) => Promise<boolean>;

  fetchEmployeeProgress: (employeeId: string) => Promise<TrainingProgress[]>;
}

function programFromSupabase(row: Record<string, unknown>): TrainingProgram {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    roleId: (row.role_id as string) || undefined,
    title: row.title as string,
    description: (row.description as string) || undefined,
    isDefault: (row.is_default as boolean) ?? false,
    welcomeMessage: (row.welcome_message as string) || undefined,
    aiPersonality: (row.ai_personality as string) || 'friendly_mentor',
    status: (row.status as TrainingProgramStatus) || 'draft',
    version: (row.version as number) ?? 1,
    passingScore: (row.passing_score as number) ?? 70,
    publishedAt: (row.published_at as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function documentFromSupabase(row: Record<string, unknown>): TrainingDocument {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    roleId: (row.role_id as string) || undefined,
    scope: (row.scope as TrainingDocument['scope']) || 'role',
    fileName: row.file_name as string,
    fileType: row.file_type as string,
    fileSize: (row.file_size as number) || undefined,
    storagePath: (row.storage_path as string) || undefined,
    extractedText: (row.extracted_text as string) || undefined,
    aiSummary: (row.ai_summary as string) || undefined,
    aiTopics: (row.ai_topics as TrainingDocumentTopic[]) || [],
    status: (row.status as TrainingDocumentStatus) || 'uploaded',
    processingError: (row.processing_error as string) || undefined,
    checksumSha256: (row.checksum_sha256 as string) || undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function moduleFromSupabase(row: Record<string, unknown>): TrainingModule {
  return {
    id: row.id as string,
    programId: row.program_id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    content: (row.content as { sections: TrainingModuleSection[] }) || { sections: [] },
    sourceDocumentIds: [],
    sortOrder: (row.sort_order as number) ?? 0,
    durationEstimate: (row.duration_estimate as number) ?? 15,
    evaluationEnabled: (row.evaluation_enabled as boolean) ?? false,
    evaluationQuestions: (row.evaluation_questions as TrainingQuestionAdmin[]) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function employeeFromSupabase(row: Record<string, unknown>): TrainingEmployee {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    roleId: (row.role_id as string) || undefined,
    candidateResultId: (row.candidate_result_id as string) || undefined,
    userId: (row.user_id as string) || undefined,
    programId: row.program_id as string,
    token: (row.token as string) || undefined,
    email: row.email as string,
    name: row.name as string,
    roleTitle: (row.role_title as string) || undefined,
    status: (row.status as TrainingEmployee['status']) || 'not_started',
    overallProgress: (row.overall_progress as number) ?? 0,
    overallScore: (row.overall_score as number) || undefined,
    hiredAt: row.hired_at as string,
    startedAt: (row.started_at as string) || undefined,
    completedAt: (row.completed_at as string) || undefined,
    accessExpiresAt: (row.access_expires_at as string) || undefined,
    accessRevokedAt: (row.access_revoked_at as string) || undefined,
    interviewData: (row.interview_data as Record<string, unknown>) || {},
    personalizationNotes: (row.personalization_notes as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
  };
}

function progressFromSupabase(row: Record<string, unknown>): TrainingProgress {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    moduleId: row.module_id as string,
    status: (row.status as TrainingProgress['status']) || 'locked',
    startedAt: (row.started_at as string) || undefined,
    completedAt: (row.completed_at as string) || undefined,
    score: (row.score as number) || undefined,
    aiFeedback: (row.ai_feedback as string) || undefined,
    timeSpent: (row.time_spent as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

export const useTrainingAdminStore = create<TrainingAdminState>()((set, get) => ({
  programs: [],
  documents: [],
  modules: [],
  employees: [],
  loading: false,
  error: null,

  setError: (error) => set({ error }),

  fetchTrainingData: async () => {
    set({ loading: true, error: null });
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        set({ loading: false, error: 'No authenticated' });
        return;
      }

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('org_id')
        .eq('user_id', user.id)
        .single();

      if (!profile?.org_id) {
        set({ loading: false, error: 'Organization profile not found' });
        return;
      }

      const orgId = profile.org_id;

      // Cargar programas
      const { data: programsData, error: programsError } = await supabase
        .from('training_programs')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (programsError) throw programsError;

      // Cargar documentos
      const { data: documentsData, error: docsError } = await supabase
        .from('training_documents')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (docsError) throw docsError;

      // Cargar módulos e incluir relaciones con documentos fuentes
      const programIds = programsData?.map((p) => p.id) || [];
      let modules: TrainingModule[] = [];
      if (programIds.length > 0) {
        const { data: mData, error: modsError } = await supabase
          .from('training_modules')
          .select(`
            *,
            training_module_documents (
              document_id
            )
          `)
          .in('program_id', programIds)
          .order('sort_order', { ascending: true });

        if (modsError) throw modsError;

        if (mData) {
          modules = mData.map((row) => {
            const base = moduleFromSupabase(row);
            const docIds = Array.isArray(row.training_module_documents)
              ? row.training_module_documents.map((d: { document_id: string }) => d.document_id)
              : [];
            return {
              ...base,
              sourceDocumentIds: docIds,
            };
          });
        }
      }

      // Cargar empleados
      const { data: employeesData, error: empError } = await supabase
        .from('training_employees')
        .select('*')
        .eq('org_id', orgId)
        .order('hired_at', { ascending: false });

      if (empError) throw empError;

      set({
        programs: programsData ? programsData.map(programFromSupabase) : [],
        documents: documentsData ? documentsData.map(documentFromSupabase) : [],
        modules,
        employees: employeesData ? employeesData.map(employeeFromSupabase) : [],
        loading: false,
      });
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in fetchTrainingData:', err);
      const errMsg = err instanceof Error ? err.message : 'Error loading training data';
      set({ error: errMsg, loading: false });
    }
  },

  // Crear programa usando API server-side (sin orgId en payload)
  createProgram: async (programData) => {
    set({ error: null });
    try {
      const res = await fetch('/api/training/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(programData),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create program');
      }

      const newProgram: TrainingProgram = await res.json();
      set((state) => ({ programs: [newProgram, ...state.programs] }));
      return newProgram;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in createProgram:', err);
      const errMsg = err instanceof Error ? err.message : 'Error creating program';
      set({ error: errMsg });
      return null;
    }
  },

  // Actualizar detalles del programa usando PATCH server-side
  updateProgram: async (id, updates) => {
    set({ error: null });
    const prevPrograms = get().programs;

    try {
      const res = await fetch(`/api/training/programs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update program details');
      }

      const data = await res.json();
      if (data.success && data.program) {
        set({
          programs: prevPrograms.map((p) => (p.id === id ? data.program : p)),
        });
        return true;
      }
      return false;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in updateProgram:', err);
      const errMsg = err instanceof Error ? err.message : 'Error updating program';
      set({ error: errMsg });
      return false;
    }
  },

  addDocument: (doc) => {
    set((state) => ({
      documents: [doc, ...state.documents],
    }));
  },

  detachDocumentFromProgram: async (programId, docId) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/training/programs/${programId}/documents?documentId=${docId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to detach document');
      }

      return true;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in detachDocumentFromProgram:', err);
      const errMsg = err instanceof Error ? err.message : 'Error detaching document';
      set({ error: errMsg });
      return false;
    }
  },

  setModules: (modules) => {
    set({ modules });
  },

  // Guardar módulo manual usando API server-side
  addModule: async (programId, moduleData) => {
    set({ error: null });
    try {
      const res = await fetch(`/api/training/programs/${programId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(moduleData),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to create module');
      }

      const data = await res.json();
      if (data.success && data.module) {
        set((state) => ({ modules: [...state.modules, data.module] }));
        return data.module;
      }
      return null;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in addModule:', err);
      const errMsg = err instanceof Error ? err.message : 'Error adding module';
      set({ error: errMsg });
      return null;
    }
  },

  // Editar módulo usando PATCH server-side
  updateModule: async (programId, moduleId, updates) => {
    set({ error: null });
    const prevModules = get().modules;

    try {
      const res = await fetch(`/api/training/programs/${programId}/modules/${moduleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update module');
      }

      const data = await res.json();
      if (data.success && data.module) {
        set({
          modules: prevModules.map((m) => (m.id === moduleId ? data.module : m)),
        });
        return true;
      }
      return false;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in updateModule:', err);
      const errMsg = err instanceof Error ? err.message : 'Error updating module';
      set({ error: errMsg });
      return false;
    }
  },

  // Eliminar módulo usando DELETE server-side
  removeModule: async (programId, moduleId) => {
    set({ error: null });
    const prevModules = get().modules;

    try {
      const res = await fetch(`/api/training/programs/${programId}/modules/${moduleId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete module');
      }

      set({ modules: prevModules.filter((m) => m.id !== moduleId) });
      return true;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in removeModule:', err);
      const errMsg = err instanceof Error ? err.message : 'Error removing module';
      set({ error: errMsg });
      return false;
    }
  },

  // Reordenar módulos usando PATCH server-side
  reorderModules: async (programId, moduleIds) => {
    set({ error: null });
    const prevModules = get().modules;

    try {
      const res = await fetch(`/api/training/programs/${programId}/modules/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleIds }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to reorder modules');
      }

      // Reordenar localmente
      const idMap = new Map(moduleIds.map((id, index) => [id, index]));

      set({
        modules: prevModules.map((m) => {
          if (m.programId === programId && idMap.has(m.id)) {
            return { ...m, sortOrder: idMap.get(m.id)! };
          }
          return m;
        }),
      });

      return true;
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error in reorderModules:', err);
      const errMsg = err instanceof Error ? err.message : 'Error reordering modules';
      set({ error: errMsg });
      return false;
    }
  },

  fetchEmployeeProgress: async (employeeId) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('training_progress')
        .select('*')
        .eq('employee_id', employeeId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ? data.map(progressFromSupabase) : [];
    } catch (err: unknown) {
      console.error('[TrainingAdminStore] Error fetching employee progress:', err);
      return [];
    }
  },
}));
