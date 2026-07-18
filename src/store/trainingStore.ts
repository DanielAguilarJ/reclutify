import { create } from 'zustand';
import type {
  TrainingEmployee,
  TrainingProgram,
  TrainingModule,
  TrainingProgress,
  TrainingSession,
  TrainingMessage,
  TrainingPhase,
} from '@/types';
import { createClient } from '@/utils/supabase/client';

// ─── Tipos de estado del store ───
interface TrainingState {
  // Identidad
  employee: TrainingEmployee | null;

  // Estado actual
  phase: TrainingPhase;
  currentModuleId: string | null;

  // Datos
  program: TrainingProgram | null;
  modules: TrainingModule[];
  progress: TrainingProgress[];
  currentSession: TrainingSession | null;
  messages: TrainingMessage[];

  // Estado de UI
  loading: boolean;
  aiSpeaking: boolean;
  error: string | null;

  // Acciones
  initializeFromToken: (token: string) => Promise<boolean>;
  initializeFromSession: () => Promise<boolean>;
  initializeFromAuth: () => Promise<boolean>;
  setPhase: (phase: TrainingPhase) => void;
  startModule: (moduleId: string) => Promise<void>;
  completeModule: (moduleId: string, score?: number) => Promise<void>;
  addMessage: (message: TrainingMessage) => void;
  setMessages: (messages: TrainingMessage[]) => void;
  setAiSpeaking: (speaking: boolean) => void;
  saveSession: () => Promise<void>;
  updateProgress: (moduleId: string, updates: Partial<TrainingProgress>) => Promise<void>;
  reset: () => void;
}

// ─── Helpers de conversión snake_case <-> camelCase ───

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
 * Helper: Convierte un TrainingSession de Supabase al formato de la app
 */
function sessionFromSupabase(row: Record<string, unknown>): TrainingSession {
  return {
    id: row.id as string,
    employeeId: row.employee_id as string,
    moduleId: (row.module_id as string) || undefined,
    sessionType: (row.session_type as TrainingSession['sessionType']) || 'general',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: (row.messages as any) || [],
    startedAt: row.started_at as string,
    endedAt: (row.ended_at as string) || undefined,
  };
}

/**
 * Helper: Carga los datos de training para un empleado
 */
async function loadTrainingDataForEmployee(
  supabase: ReturnType<typeof createClient>,
  employee: TrainingEmployee
): Promise<{
  program: TrainingProgram | null;
  modules: TrainingModule[];
  progress: TrainingProgress[];
}> {
  // Cargar programa
  const { data: programData } = await supabase
    .from('training_programs')
    .select('*')
    .eq('id', employee.programId)
    .single();

  // Cargar módulos ordenados por sort_order
  const { data: modulesData } = await supabase
    .from('training_modules')
    .select('*')
    .eq('program_id', employee.programId)
    .order('sort_order', { ascending: true });

  // Cargar progreso del empleado
  const { data: progressData } = await supabase
    .from('training_progress')
    .select('*')
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: true });

  return {
    program: programData ? programFromSupabase(programData) : null,
    modules: modulesData ? modulesData.map(moduleFromSupabase) : [],
    progress: progressData ? progressData.map(progressFromSupabase) : [],
  };
}

/**
 * Helper: Determina la fase inicial basándose en el estado del empleado
 */
function determineInitialPhase(employee: TrainingEmployee): TrainingPhase {
  if (employee.status === 'completed') return 'complete';
  if (employee.status === 'not_started') return 'welcome';
  return 'overview';
}

/**
 * Store de training del empleado — experiencia de aprendizaje.
 * SIN persistencia en localStorage para garantizar sincronización cross-device.
 */
export const useTrainingStore = create<TrainingState>()(
  (set, get) => ({
    employee: null as TrainingEmployee | null,
    phase: 'welcome' as TrainingPhase,
    currentModuleId: null as string | null,
    program: null as TrainingProgram | null,
    modules: [] as TrainingModule[],
    progress: [] as TrainingProgress[],
    currentSession: null as TrainingSession | null,
    messages: [] as TrainingMessage[],
    loading: false as boolean,
    aiSpeaking: false as boolean,
    error: null as string | null,

    // ─── Inicializar desde token (empleado sin autenticar) ───
    initializeFromToken: async (token: string) => {
      set({ loading: true, error: null });

      try {
        const accessResponse = await fetch('/api/training/access', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (!accessResponse.ok) {
          const body = await accessResponse
            .json()
            .catch(() => ({ error: 'Token inválido o expirado' }));

          set({
            loading: false,
            error: body.error || 'Token inválido o expirado',
          });

          return false;
        }

        /*
         * El token ya fue convertido en una cookie HttpOnly.
         * Ahora se cargan los datos por medio del endpoint seguro.
         */
        return await get().initializeFromSession();
      } catch (error) {
        console.error(
          '[TrainingStore] Error inicializando desde token:',
          error,
        );

        set({
          loading: false,
          error: 'Error cargando datos de capacitación',
        });

        return false;
      }
    },

    initializeFromSession: async () => {
      set({ loading: true, error: null });

      try {
        const response = await fetch('/api/training/bootstrap', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store',
        });

        if (!response.ok) {
          const body = await response
            .json()
            .catch(() => ({ error: 'Sesión de capacitación inválida' }));

          set({
            employee: null,
            program: null,
            modules: [],
            progress: [],
            loading: false,
            error: body.error || 'Sesión de capacitación inválida',
          });

          return false;
        }

        const data = await response.json();

        const employee = employeeFromSupabase(data.employee);
        const program = data.program
          ? programFromSupabase(data.program)
          : null;
        const modules = Array.isArray(data.modules)
          ? data.modules.map(moduleFromSupabase)
          : [];
        const progress = Array.isArray(data.progress)
          ? data.progress.map(progressFromSupabase)
          : [];

        set({
          employee,
          program,
          modules,
          progress,
          phase: determineInitialPhase(employee),
          loading: false,
          error: null,
        });

        return true;
      } catch (error) {
        console.error(
          '[TrainingStore] Error inicializando desde sesión:',
          error,
        );

        set({
          employee: null,
          program: null,
          modules: [],
          progress: [],
          loading: false,
          error: 'Error cargando datos de capacitación',
        });

        return false;
      }
    },

    // ─── Inicializar desde auth (empleado autenticado) ───
    initializeFromAuth: async () => {
      set({ loading: true, error: null });
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          set({ loading: false, error: 'No autenticado' });
          return false;
        }

        // Buscar empleado por user_id
        const { data: employeeData, error: empError } = await supabase
          .from('training_employees')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (empError || !employeeData) {
          set({ loading: false, error: 'No se encontró perfil de empleado' });
          return false;
        }

        const employee = employeeFromSupabase(employeeData);

        // Cargar datos del programa, módulos y progreso
        const { program, modules, progress } = await loadTrainingDataForEmployee(supabase, employee);

        const phase = determineInitialPhase(employee);

        set({
          employee,
          program,
          modules,
          progress,
          phase,
          loading: false,
        });

        return true;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error inicializando desde auth:', err);
        }
        set({ loading: false, error: 'Error cargando datos de training' });
        return false;
      }
    },

    // ─── Cambiar fase ───
    setPhase: (phase: TrainingPhase) => {
      set({ phase });
    },

    // ─── Iniciar módulo ───
    startModule: async (moduleId: string) => {
      const { employee, progress } = get();
      if (!employee) return;

      const now = new Date().toISOString();

      // Actualizar progreso local
      const updatedProgress = progress.map((p) =>
        p.moduleId === moduleId
          ? { ...p, status: 'in_progress' as const, startedAt: now }
          : p
      );

      set({
        currentModuleId: moduleId,
        progress: updatedProgress,
        phase: 'module',
        messages: [],
      });

      // Actualizar progreso en Supabase
      try {
        const supabase = createClient();
        const { error: progError } = await supabase
          .from('training_progress')
          .update({ status: 'in_progress', started_at: now })
          .eq('employee_id', employee.id)
          .eq('module_id', moduleId);

        if (progError && process.env.NODE_ENV === 'development') {
          console.error('Error actualizando progreso:', progError);
        }

        // Crear o reanudar sesión
        const { data: existingSession } = await supabase
          .from('training_sessions')
          .select('*')
          .eq('employee_id', employee.id)
          .eq('module_id', moduleId)
          .is('ended_at', null)
          .single();

        if (existingSession) {
          const session = sessionFromSupabase(existingSession);
          set({ currentSession: session, messages: session.messages });
        } else {
          const newSession: TrainingSession = {
            id: crypto.randomUUID(),
            employeeId: employee.id,
            moduleId,
            sessionType: 'module',
            messages: [],
            startedAt: now,
          };

          set({ currentSession: newSession });

          const { error: sessError } = await supabase
            .from('training_sessions')
            .insert({
              id: newSession.id,
              employee_id: newSession.employeeId,
              module_id: newSession.moduleId,
              session_type: newSession.sessionType,
              messages: newSession.messages,
              started_at: newSession.startedAt,
            });

          if (sessError && process.env.NODE_ENV === 'development') {
            console.error('Error creando sesión:', sessError);
          }
        }

        // Actualizar estado del empleado a 'active' si estaba 'not_started'
        if (employee.status === 'not_started') {
          const { error: empError } = await supabase
            .from('training_employees')
            .update({ status: 'active', started_at: now })
            .eq('id', employee.id);

          if (empError && process.env.NODE_ENV === 'development') {
            console.error('Error actualizando estado del empleado:', empError);
          }

          set((state: TrainingState) => ({
            employee: state.employee
              ? { ...state.employee, status: 'active', startedAt: now }
              : null,
          }));
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error iniciando módulo:', err);
        }
      }
    },

    // ─── Completar módulo ───
    completeModule: async (moduleId: string, score?: number) => {
      const { employee, modules, progress } = get();
      if (!employee) return;

      const now = new Date().toISOString();

      // Encontrar el módulo actual y el siguiente por sort_order
      const sortedModules = [...modules].sort((a, b) => a.sortOrder - b.sortOrder);
      const currentIndex = sortedModules.findIndex((m) => m.id === moduleId);
      const nextModule = currentIndex < sortedModules.length - 1
        ? sortedModules[currentIndex + 1]
        : null;

      // Actualizar progreso: completar actual, desbloquear siguiente
      const updatedProgress = progress.map((p) => {
        if (p.moduleId === moduleId) {
          return { ...p, status: 'completed' as const, completedAt: now, score };
        }
        if (nextModule && p.moduleId === nextModule.id && p.status === 'locked') {
          return { ...p, status: 'available' as const };
        }
        return p;
      });

      // Recalcular progreso general
      const completedCount = updatedProgress.filter((p) => p.status === 'completed').length;
      const totalModules = updatedProgress.length;
      const overallProgress = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

      // Determinar si todos los módulos están completados
      const allCompleted = completedCount === totalModules;
      const newStatus = allCompleted ? 'completed' as const : employee.status;
      const newPhase: TrainingPhase = allCompleted ? 'complete' : 'overview';

      // Calcular score promedio si hay scores
      const scores = updatedProgress
        .filter((p) => p.score !== undefined)
        .map((p) => p.score as number);
      const overallScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : undefined;

      set({
        progress: updatedProgress,
        currentModuleId: null,
        phase: newPhase,
        employee: employee
          ? {
              ...employee,
              status: newStatus,
              overallProgress,
              overallScore,
              completedAt: allCompleted ? now : employee.completedAt,
            }
          : null,
      });

      // Sincronizar con Supabase
      try {
        const supabase = createClient();

        // Actualizar progreso del módulo completado
        const { error: progError } = await supabase
          .from('training_progress')
          .update({
            status: 'completed',
            completed_at: now,
            score: score || null,
          })
          .eq('employee_id', employee.id)
          .eq('module_id', moduleId);

        if (progError && process.env.NODE_ENV === 'development') {
          console.error('Error completando progreso:', progError);
        }

        // Desbloquear siguiente módulo
        if (nextModule) {
          const { error: unlockError } = await supabase
            .from('training_progress')
            .update({ status: 'available' })
            .eq('employee_id', employee.id)
            .eq('module_id', nextModule.id)
            .eq('status', 'locked');

          if (unlockError && process.env.NODE_ENV === 'development') {
            console.error('Error desbloqueando siguiente módulo:', unlockError);
          }
        }

        // Actualizar empleado con progreso general
        const employeeUpdates: Record<string, unknown> = {
          overall_progress: overallProgress,
        };
        if (overallScore !== undefined) employeeUpdates.overall_score = overallScore;
        if (allCompleted) {
          employeeUpdates.status = 'completed';
          employeeUpdates.completed_at = now;
        }

        const { error: empError } = await supabase
          .from('training_employees')
          .update(employeeUpdates)
          .eq('id', employee.id);

        if (empError && process.env.NODE_ENV === 'development') {
          console.error('Error actualizando empleado:', empError);
        }

        // Cerrar sesión actual
        const { currentSession } = get();
        if (currentSession) {
          const { error: sessError } = await supabase
            .from('training_sessions')
            .update({ ended_at: now, messages: get().messages })
            .eq('id', currentSession.id);

          if (sessError && process.env.NODE_ENV === 'development') {
            console.error('Error cerrando sesión:', sessError);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error completando módulo:', err);
        }
      }
    },

    // ─── Agregar mensaje ───
    addMessage: (message: TrainingMessage) => {
      set((state: TrainingState) => ({
        messages: [...state.messages, message],
      }));
    },

    // ─── Establecer mensajes ───
    setMessages: (messages: TrainingMessage[]) => {
      set({ messages });
    },

    // ─── Establecer estado de AI hablando ───
    setAiSpeaking: (speaking: boolean) => {
      set({ aiSpeaking: speaking });
    },

    // ─── Guardar sesión actual en Supabase ───
    saveSession: async () => {
      const { currentSession, messages } = get();
      if (!currentSession) return;

      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('training_sessions')
          .update({ messages })
          .eq('id', currentSession.id);

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error guardando sesión:', error);
        }

        set({ currentSession: { ...currentSession, messages } });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando sesión:', err);
        }
      }
    },

    // ─── Actualizar progreso de un módulo ───
    updateProgress: async (moduleId: string, updates: Partial<TrainingProgress>) => {
      const { employee, progress } = get();
      if (!employee) return;

      // Actualizar estado local
      const updatedProgress = progress.map((p) =>
        p.moduleId === moduleId ? { ...p, ...updates } : p
      );
      set({ progress: updatedProgress });

      // Sincronizar con Supabase
      try {
        const supabase = createClient();
        const supabaseUpdates: Record<string, unknown> = {};
        if (updates.status !== undefined) supabaseUpdates.status = updates.status;
        if (updates.startedAt !== undefined) supabaseUpdates.started_at = updates.startedAt;
        if (updates.completedAt !== undefined) supabaseUpdates.completed_at = updates.completedAt;
        if (updates.score !== undefined) supabaseUpdates.score = updates.score;
        if (updates.aiFeedback !== undefined) supabaseUpdates.ai_feedback = updates.aiFeedback;
        if (updates.timeSpent !== undefined) supabaseUpdates.time_spent = updates.timeSpent;

        if (Object.keys(supabaseUpdates).length > 0) {
          const { error } = await supabase
            .from('training_progress')
            .update(supabaseUpdates)
            .eq('employee_id', employee.id)
            .eq('module_id', moduleId);

          if (error && process.env.NODE_ENV === 'development') {
            console.error('Error actualizando progreso:', error);
          }
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando progreso:', err);
        }
      }
    },

    // ─── Resetear store ───
    reset: () => {
      set({
        employee: null,
        phase: 'welcome',
        currentModuleId: null,
        program: null,
        modules: [],
        progress: [],
        currentSession: null,
        messages: [],
        loading: false,
        aiSpeaking: false,
        error: null,
      });
    },
  })
);
