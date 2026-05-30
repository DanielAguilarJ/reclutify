import { create } from 'zustand';
import type {
  TrainingProgram,
  TrainingDocument,
  TrainingModule,
  TrainingEmployee,
  TrainingProgress,
} from '@/types';
import { createClient } from '@/utils/supabase/client';

// ─── Tipos de estado del store ───
interface TrainingAdminState {
  // Datos principales
  programs: TrainingProgram[];
  documents: TrainingDocument[];
  modules: TrainingModule[];
  employees: TrainingEmployee[];
  loading: boolean;
  error: string | null;

  // Acciones de carga
  fetchTrainingData: () => Promise<void>;

  // Acciones de programas
  createProgram: (program: Omit<TrainingProgram, 'id' | 'createdAt' | 'updatedAt'>) => Promise<TrainingProgram | null>;
  updateProgram: (id: string, updates: Partial<TrainingProgram>) => Promise<void>;

  // Acciones de documentos
  addDocument: (doc: TrainingDocument) => void;
  removeDocument: (id: string) => Promise<void>;
  reorderDocuments: (documents: TrainingDocument[]) => Promise<void>;

  // Acciones de módulos
  setModules: (modules: TrainingModule[]) => void;
  addModule: (module: TrainingModule) => Promise<void>;
  updateModule: (id: string, updates: Partial<TrainingModule>) => Promise<void>;
  removeModule: (id: string) => Promise<void>;
  reorderModules: (modules: TrainingModule[]) => Promise<void>;

  // Acciones de empleados
  hireCandidate: (candidateResultId: string, email: string, name: string, roleTitle: string, programId: string, interviewData: any) => Promise<TrainingEmployee | null>;
  fetchEmployeeProgress: (employeeId: string) => Promise<TrainingProgress[]>;
}

// ─── Helpers de conversión snake_case <-> camelCase ───

/**
 * Helper: Convierte un TrainingProgram del formato de la app al formato de Supabase
 */
function programToSupabase(program: TrainingProgram) {
  return {
    id: program.id,
    org_id: program.orgId,
    title: program.title,
    description: program.description || null,
    is_default: program.isDefault,
    welcome_message: program.welcomeMessage || null,
    ai_personality: program.aiPersonality,
    created_at: program.createdAt,
    updated_at: program.updatedAt,
  };
}

/**
 * Helper: Convierte un TrainingProgram de Supabase al formato de la app
 */
function programFromSupabase(row: Record<string, unknown>): TrainingProgram {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    isDefault: (row.is_default as boolean) ?? false,
    welcomeMessage: (row.welcome_message as string) || undefined,
    aiPersonality: (row.ai_personality as string) || 'friendly',
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Helper: Convierte un TrainingDocument de Supabase al formato de la app
 */
function documentFromSupabase(row: Record<string, unknown>): TrainingDocument {
  return {
    id: row.id as string,
    programId: row.program_id as string,
    orgId: row.org_id as string,
    fileName: row.file_name as string,
    fileUrl: row.file_url as string,
    fileType: row.file_type as string,
    fileSize: (row.file_size as number) || undefined,
    extractedText: (row.extracted_text as string) || undefined,
    aiSummary: (row.ai_summary as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    aiTopics: (row.ai_topics as any) || [],
    sortOrder: (row.sort_order as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

/**
 * Helper: Convierte un TrainingDocument al formato de Supabase
 */
function documentToSupabase(doc: TrainingDocument) {
  return {
    id: doc.id,
    program_id: doc.programId,
    org_id: doc.orgId,
    file_name: doc.fileName,
    file_url: doc.fileUrl,
    file_type: doc.fileType,
    file_size: doc.fileSize || null,
    extracted_text: doc.extractedText || null,
    ai_summary: doc.aiSummary || null,
    ai_topics: doc.aiTopics || [],
    sort_order: doc.sortOrder,
    created_at: doc.createdAt,
  };
}

/**
 * Helper: Convierte un TrainingModule de Supabase al formato de la app
 */
function moduleFromSupabase(row: Record<string, unknown>): TrainingModule {
  return {
    id: row.id as string,
    programId: row.program_id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    content: (row.content as any) || { sections: [] },
    sourceDocumentId: (row.source_document_id as string) || undefined,
    sortOrder: (row.sort_order as number) ?? 0,
    durationEstimate: (row.duration_estimate as number) ?? 15,
    evaluationEnabled: (row.evaluation_enabled as boolean) ?? false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evaluationQuestions: (row.evaluation_questions as any) || [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Helper: Convierte un TrainingModule al formato de Supabase
 */
function moduleToSupabase(module: TrainingModule) {
  return {
    id: module.id,
    program_id: module.programId,
    title: module.title,
    description: module.description || null,
    content: module.content,
    source_document_id: module.sourceDocumentId || null,
    sort_order: module.sortOrder,
    duration_estimate: module.durationEstimate,
    evaluation_enabled: module.evaluationEnabled,
    evaluation_questions: module.evaluationQuestions,
    created_at: module.createdAt,
    updated_at: module.updatedAt,
  };
}

/**
 * Helper: Convierte un TrainingEmployee de Supabase al formato de la app
 */
function employeeFromSupabase(row: Record<string, unknown>): TrainingEmployee {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    candidateResultId: (row.candidate_result_id as string) || undefined,
    userId: (row.user_id as string) || undefined,
    programId: row.program_id as string,
    token: row.token as string,
    email: row.email as string,
    name: row.name as string,
    roleTitle: (row.role_title as string) || undefined,
    status: (row.status as TrainingEmployee['status']) || 'not_started',
    overallProgress: (row.overall_progress as number) ?? 0,
    overallScore: (row.overall_score as number) || undefined,
    hiredAt: row.hired_at as string,
    startedAt: (row.started_at as string) || undefined,
    completedAt: (row.completed_at as string) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    interviewData: (row.interview_data as any) || {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    personalizationNotes: (row.personalization_notes as any) || {},
    createdAt: row.created_at as string,
  };
}

/**
 * Helper: Convierte un TrainingEmployee al formato de Supabase
 */
function employeeToSupabase(employee: TrainingEmployee) {
  return {
    id: employee.id,
    org_id: employee.orgId,
    candidate_result_id: employee.candidateResultId || null,
    user_id: employee.userId || null,
    program_id: employee.programId,
    token: employee.token,
    email: employee.email,
    name: employee.name,
    role_title: employee.roleTitle || null,
    status: employee.status,
    overall_progress: employee.overallProgress,
    overall_score: employee.overallScore || null,
    hired_at: employee.hiredAt,
    started_at: employee.startedAt || null,
    completed_at: employee.completedAt || null,
    interview_data: employee.interviewData,
    personalization_notes: employee.personalizationNotes,
    created_at: employee.createdAt,
  };
}

/**
 * Helper: Convierte un TrainingProgress de Supabase al formato de la app
 */
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

/**
 * Helper: Genera un token único de 8 caracteres (mismo charset que interview tickets)
 */
function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

/**
 * Store de administración de training — caché en memoria con Supabase como fuente de verdad.
 * SIN persistencia en localStorage para garantizar sincronización cross-device.
 */
export const useTrainingAdminStore = create<TrainingAdminState>()(
  (set, get) => ({
    programs: [] as TrainingProgram[],
    documents: [] as TrainingDocument[],
    modules: [] as TrainingModule[],
    employees: [] as TrainingEmployee[],
    loading: false as boolean,
    error: null as string | null,

    // ─── Cargar datos de training desde Supabase ───
    fetchTrainingData: async () => {
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

        // Cargar programas de training
        const { data: programsData, error: programsError } = await supabase
          .from('training_programs')
          .select('*')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false });

        if (programsError && process.env.NODE_ENV === 'development') {
          console.error('Error cargando programas:', programsError);
        }

        // Cargar documentos de training
        const { data: documentsData, error: docsError } = await supabase
          .from('training_documents')
          .select('*')
          .eq('org_id', orgId)
          .order('sort_order', { ascending: true });

        if (docsError && process.env.NODE_ENV === 'development') {
          console.error('Error cargando documentos:', docsError);
        }

        // Cargar módulos de training
        const programIds = programsData?.map((p) => p.id) || [];
        let modulesData: Record<string, unknown>[] | null = null;
        if (programIds.length > 0) {
          const { data: mData, error: modsError } = await supabase
            .from('training_modules')
            .select('*')
            .in('program_id', programIds)
            .order('sort_order', { ascending: true });

          if (modsError && process.env.NODE_ENV === 'development') {
            console.error('Error cargando módulos:', modsError);
          }
          modulesData = mData;
        }

        // Cargar empleados de training
        const { data: employeesData, error: empError } = await supabase
          .from('training_employees')
          .select('*')
          .eq('org_id', orgId)
          .order('hired_at', { ascending: false });

        if (empError && process.env.NODE_ENV === 'development') {
          console.error('Error cargando empleados:', empError);
        }

        set({
          programs: programsData ? programsData.map(programFromSupabase) : [],
          documents: documentsData ? documentsData.map(documentFromSupabase) : [],
          modules: modulesData ? modulesData.map(moduleFromSupabase) : [],
          employees: employeesData ? employeesData.map(employeeFromSupabase) : [],
          loading: false,
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error en fetchTrainingData:', err);
        }
        set({ error: 'Error cargando datos de training', loading: false });
      }
    },

    // ─── Crear programa: Supabase + store local ───
    createProgram: async (programData) => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.org_id) return null;

        const now = new Date().toISOString();
        const program: TrainingProgram = {
          id: crypto.randomUUID(),
          ...programData,
          orgId: profile.org_id,
          createdAt: now,
          updatedAt: now,
        };

        // Actualizar estado local inmediatamente (optimistic update)
        set((state: TrainingAdminState) => ({
          programs: [program, ...state.programs],
        }));

        // Sincronizar con Supabase en segundo plano
        const { error } = await supabase
          .from('training_programs')
          .upsert(programToSupabase(program));

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error creando programa en Supabase:', error);
        }

        return program;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error creando programa:', err);
        }
        return null;
      }
    },

    // ─── Actualizar programa: Supabase + store local ───
    updateProgram: async (id: string, updates: Partial<TrainingProgram>) => {
      set((state: TrainingAdminState) => ({
        programs: state.programs.map((p) =>
          p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
        ),
      }));

      try {
        const supabase = createClient();
        const supabaseUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.title !== undefined) supabaseUpdates.title = updates.title;
        if (updates.description !== undefined) supabaseUpdates.description = updates.description;
        if (updates.isDefault !== undefined) supabaseUpdates.is_default = updates.isDefault;
        if (updates.welcomeMessage !== undefined) supabaseUpdates.welcome_message = updates.welcomeMessage;
        if (updates.aiPersonality !== undefined) supabaseUpdates.ai_personality = updates.aiPersonality;

        const { error } = await supabase
          .from('training_programs')
          .update(supabaseUpdates)
          .eq('id', id);

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error actualizando programa en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando actualización de programa:', err);
        }
      }
    },

    // ─── Agregar documento: store local (Supabase se maneja externamente al subir) ───
    addDocument: (doc: TrainingDocument) => {
      set((state: TrainingAdminState) => ({
        documents: [...state.documents, doc],
      }));
    },

    // ─── Eliminar documento: Supabase + store local ───
    removeDocument: async (id: string) => {
      set((state: TrainingAdminState) => ({
        documents: state.documents.filter((d) => d.id !== id),
      }));

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('training_documents')
          .delete()
          .eq('id', id);

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error eliminando documento en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando eliminación de documento:', err);
        }
      }
    },

    // ─── Reordenar documentos: Supabase + store local ───
    reorderDocuments: async (documents: TrainingDocument[]) => {
      set({ documents });

      try {
        const supabase = createClient();
        const updates = documents.map((doc, index) => ({
          id: doc.id,
          sort_order: index,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from('training_documents')
            .update({ sort_order: update.sort_order })
            .eq('id', update.id);

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error reordenando documento:', error);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando reorden de documentos:', err);
        }
      }
    },

    // ─── Set módulos: store local ───
    setModules: (modules: TrainingModule[]) => {
      set({ modules });
    },

    // ─── Agregar módulo: Supabase + store local ───
    addModule: async (module: TrainingModule) => {
      set((state: TrainingAdminState) => ({
        modules: [...state.modules, module],
      }));

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('training_modules')
          .upsert(moduleToSupabase(module));

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error guardando módulo en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando módulo:', err);
        }
      }
    },

    // ─── Actualizar módulo: Supabase + store local ───
    updateModule: async (id: string, updates: Partial<TrainingModule>) => {
      set((state: TrainingAdminState) => ({
        modules: state.modules.map((m) =>
          m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m
        ),
      }));

      try {
        const supabase = createClient();
        const supabaseUpdates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (updates.title !== undefined) supabaseUpdates.title = updates.title;
        if (updates.description !== undefined) supabaseUpdates.description = updates.description;
        if (updates.content !== undefined) supabaseUpdates.content = updates.content;
        if (updates.sourceDocumentId !== undefined) supabaseUpdates.source_document_id = updates.sourceDocumentId;
        if (updates.sortOrder !== undefined) supabaseUpdates.sort_order = updates.sortOrder;
        if (updates.durationEstimate !== undefined) supabaseUpdates.duration_estimate = updates.durationEstimate;
        if (updates.evaluationEnabled !== undefined) supabaseUpdates.evaluation_enabled = updates.evaluationEnabled;
        if (updates.evaluationQuestions !== undefined) supabaseUpdates.evaluation_questions = updates.evaluationQuestions;

        const { error } = await supabase
          .from('training_modules')
          .update(supabaseUpdates)
          .eq('id', id);

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error actualizando módulo en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando actualización de módulo:', err);
        }
      }
    },

    // ─── Eliminar módulo: Supabase + store local ───
    removeModule: async (id: string) => {
      set((state: TrainingAdminState) => ({
        modules: state.modules.filter((m) => m.id !== id),
      }));

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('training_modules')
          .delete()
          .eq('id', id);

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error eliminando módulo en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando eliminación de módulo:', err);
        }
      }
    },

    // ─── Reordenar módulos: Supabase + store local ───
    reorderModules: async (modules: TrainingModule[]) => {
      set({ modules });

      try {
        const supabase = createClient();
        const updates = modules.map((mod, index) => ({
          id: mod.id,
          sort_order: index,
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from('training_modules')
            .update({ sort_order: update.sort_order })
            .eq('id', update.id);

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error reordenando módulo:', error);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando reorden de módulos:', err);
        }
      }
    },

    // ─── Contratar candidato: crear empleado + inicializar progreso ───
    hireCandidate: async (candidateResultId, email, name, roleTitle, programId, interviewData) => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.org_id) return null;

        const orgId = profile.org_id;
        const now = new Date().toISOString();
        const token = generateToken();

        const employee: TrainingEmployee = {
          id: crypto.randomUUID(),
          orgId,
          candidateResultId,
          programId,
          token,
          email,
          name,
          roleTitle,
          status: 'not_started',
          overallProgress: 0,
          hiredAt: now,
          interviewData: interviewData || {},
          personalizationNotes: {},
          createdAt: now,
        };

        // Actualizar estado local inmediatamente (optimistic update)
        set((state: TrainingAdminState) => ({
          employees: [employee, ...state.employees],
        }));

        // Insertar empleado en Supabase
        const { error: empError } = await supabase
          .from('training_employees')
          .upsert(employeeToSupabase(employee));

        if (empError) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error insertando empleado en Supabase:', empError);
          }
          return null;
        }

        // Obtener módulos del programa para inicializar el progreso
        const programModules = get().modules
          .filter((m) => m.programId === programId)
          .sort((a, b) => a.sortOrder - b.sortOrder);

        // Inicializar progreso: primer módulo 'available', el resto 'locked'
        const progressEntries = programModules.map((mod, index) => ({
          id: crypto.randomUUID(),
          employee_id: employee.id,
          module_id: mod.id,
          status: index === 0 ? 'available' : 'locked',
          time_spent: 0,
          created_at: now,
        }));

        if (progressEntries.length > 0) {
          const { error: progError } = await supabase
            .from('training_progress')
            .insert(progressEntries);

          if (progError && process.env.NODE_ENV === 'development') {
            console.error('Error inicializando progreso:', progError);
          }
        }

        return employee;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error contratando candidato:', err);
        }
        return null;
      }
    },

    // ─── Obtener progreso de un empleado ───
    fetchEmployeeProgress: async (employeeId: string) => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('training_progress')
          .select('*')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: true });

        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error cargando progreso:', error);
          }
          return [];
        }

        return data ? data.map(progressFromSupabase) : [];
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error obteniendo progreso del empleado:', err);
        }
        return [];
      }
    },
  })
);
