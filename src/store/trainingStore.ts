import { create } from 'zustand';
import type {
  TrainingEmployee,
  TrainingProgram,
  TrainingModule,
  TrainingProgress,
  TrainingSession,
  TrainingMessage,
  TrainingPhase,
  TrainingProgramStatus,
  TrainingQuestionAdmin,
  TrainingModuleSection,
} from '@/types';

// ─── Tipos de estado del store ───
interface TrainingState {
  employee: TrainingEmployee | null;
  phase: TrainingPhase;
  currentModuleId: string | null;
  program: TrainingProgram | null;
  modules: TrainingModule[];
  progress: TrainingProgress[];
  currentSession: TrainingSession | null;
  generalMessages: TrainingMessage[];
  moduleMessages: Record<string, TrainingMessage[]>;
  loading: boolean;
  aiSpeaking: boolean;
  error: string | null;

  initializeFromToken: (token: string) => Promise<boolean>;
  initializeFromSession: () => Promise<boolean>;
  initializeFromAuth: () => Promise<boolean>;
  setPhase: (phase: TrainingPhase) => void;
  startModule: (moduleId: string) => Promise<void>;
  completeModule: (moduleId: string, answers: Record<number, string>) => Promise<{ score: number; passed: boolean; feedback: unknown }>;
  completeModuleWithoutEvaluation: (moduleId: string) => Promise<boolean>;
  startGeneralChat: () => Promise<void>;
  sendGeneralMessage: (message: string) => Promise<void>;
  startModuleChat: (moduleId: string) => Promise<void>;
  sendModuleMessage: (moduleId: string, message: string) => Promise<void>;
  setAiSpeaking: (speaking: boolean) => void;
  updateProgress: (moduleId: string, updates: Partial<TrainingProgress>) => Promise<void>;
  reset: () => void;
}

function programFromSupabase(row: Record<string, unknown>): TrainingProgram {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    title: row.title as string,
    description: (row.description as string) || undefined,
    isDefault: (row.is_default as boolean) ?? false,
    welcomeMessage: (row.welcome_message as string) || undefined,
    aiPersonality: (row.ai_personality as string) || 'friendly',
    status: (row.status as TrainingProgramStatus) || 'draft',
    version: (row.version as number) ?? 1,
    passingScore: (row.passing_score as number) ?? 70,
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
    sourceDocumentIds: (row.source_document_ids as string[]) || [],
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
    candidateResultId: (row.candidate_result_id as string) || undefined,
    userId: (row.user_id as string) || undefined,
    programId: row.program_id as string,
    email: row.email as string,
    name: row.name as string,
    roleTitle: (row.role_title as string) || undefined,
    status: (row.status as TrainingEmployee['status']) || 'not_started',
    overallProgress: (row.overall_progress as number) ?? 0,
    overallScore: (row.overall_score as number) || undefined,
    hiredAt: row.hired_at as string,
    startedAt: (row.started_at as string) || undefined,
    completedAt: (row.completed_at as string) || undefined,
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

function determineInitialPhase(employee: TrainingEmployee): TrainingPhase {
  if (employee.status === 'completed') return 'complete';
  if (employee.status === 'not_started') return 'welcome';
  return 'overview';
}

export const useTrainingStore = create<TrainingState>()((set, get) => ({
  employee: null,
  phase: 'welcome',
  currentModuleId: null,
  program: null,
  modules: [],
  progress: [],
  currentSession: null,
  generalMessages: [],
  moduleMessages: {},
  loading: false,
  aiSpeaking: false,
  error: null,

  initializeFromToken: async (token: string) => {
    set({ loading: true, error: null });
    try {
      const accessResponse = await fetch('/api/training/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      if (!accessResponse.ok) {
        const body = await accessResponse.json().catch(() => ({ error: 'Token inválido o expirado' }));
        set({ loading: false, error: body.error || 'Token inválido o expirado' });
        return false;
      }

      return await get().initializeFromSession();
    } catch (error) {
      console.error('[TrainingStore] Error initializing from token:', error);
      set({ loading: false, error: 'Error cargando datos de capacitación' });
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
        const body = await response.json().catch(() => ({ error: 'Sesión de capacitación inválida' }));
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
      const program = data.program ? programFromSupabase(data.program) : null;
      const modules = Array.isArray(data.modules) ? data.modules.map(moduleFromSupabase) : [];
      const progress = Array.isArray(data.progress) ? data.progress.map(progressFromSupabase) : [];

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
      console.error('[TrainingStore] Error initializing from session:', error);
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

  initializeFromAuth: async () => {
    return await get().initializeFromSession();
  },

  setPhase: (phase: TrainingPhase) => {
    set({ phase });
  },

  startModule: async (moduleId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/training/start-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to start module');
      }

      const data = await response.json();

      await get().initializeFromSession();

      set((state) => ({
        currentModuleId: moduleId,
        currentSession: data.session,
        moduleMessages: {
          ...state.moduleMessages,
          [moduleId]: data.session?.messages || [],
        },
        phase: 'module',
        loading: false,
      }));
    } catch (err: unknown) {
      console.error('[TrainingStore] Error starting module:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to start module';
      set({ loading: false, error: errMsg });
    }
  },

  completeModule: async (moduleId: string, answers: Record<number, string>) => {
    set({ loading: true, error: null });
    try {
      // Adapt Record structure to array validation expected by contracts
      const formattedAnswers = Object.entries(answers).map(([idx, val]) => ({
        questionIndex: parseInt(idx, 10),
        answer: val,
      }));

      const response = await fetch('/api/training/evaluate-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, answers: formattedAnswers }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to evaluate module');
      }

      const data = await response.json();

      await get().initializeFromSession();

      set({ loading: false });

      return {
        score: data.score,
        passed: data.passed,
        feedback: data.feedback,
      };
    } catch (err: unknown) {
      console.error('[TrainingStore] Error evaluation completion:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to complete evaluation';
      set({ loading: false, error: errMsg });
      throw err;
    }
  },

  completeModuleWithoutEvaluation: async (moduleId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await fetch('/api/training/complete-module', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Failed to complete module');
      }

      await get().initializeFromSession();
      set({ loading: false });
      return true;
    } catch (err: unknown) {
      console.error('[TrainingStore] Error completing module without evaluation:', err);
      const errMsg = err instanceof Error ? err.message : 'Failed to complete module';
      set({ loading: false, error: errMsg });
      return false;
    }
  },

  startGeneralChat: async () => {
    set({ aiSpeaking: true, error: null });
    try {
      const response = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'general',
          action: 'start',
        }),
      });

      if (!response.ok) throw new Error('Failed to initialize tutor');

      const data = await response.json();
      const tutorMsg: TrainingMessage = {
        role: 'assistant',
        content: data.message,
        type: data.type || 'text',
        citations: data.citations || [],
        timestamp: Date.now(),
      };

      set({
        generalMessages: data.history && data.history.length > 0 ? data.history : [tutorMsg],
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect';
      set({ error: errMsg });
    } finally {
      set({ aiSpeaking: false });
    }
  },

  sendGeneralMessage: async (messageText: string) => {
    const userMsg: TrainingMessage = {
      role: 'user',
      content: messageText.trim(),
      timestamp: Date.now(),
    };

    set((state) => ({
      generalMessages: [...state.generalMessages, userMsg],
      aiSpeaking: true,
      error: null,
    }));

    try {
      const response = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'general',
          message: messageText.trim(),
        }),
      });

      if (!response.ok) throw new Error('Tutor offline');

      const data = await response.json();
      const assistantMsg: TrainingMessage = {
        role: 'assistant',
        content: data.message,
        type: data.type || 'text',
        citations: data.citations || [],
        timestamp: Date.now(),
      };

      set((state) => ({
        generalMessages: [...state.generalMessages, assistantMsg],
      }));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to get answer';
      set({ error: errMsg });
    } finally {
      set({ aiSpeaking: false });
    }
  },

  startModuleChat: async (moduleId: string) => {
    set({ aiSpeaking: true, error: null });
    try {
      const response = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'module',
          moduleId,
          action: 'start',
        }),
      });

      if (!response.ok) throw new Error('Failed to initialize module tutor');

      const data = await response.json();
      const tutorMsg: TrainingMessage = {
        role: 'assistant',
        content: data.message,
        type: data.type || 'text',
        citations: data.citations || [],
        timestamp: Date.now(),
      };

      set((state) => ({
        moduleMessages: {
          ...state.moduleMessages,
          [moduleId]: data.history && data.history.length > 0 ? data.history : [tutorMsg],
        },
      }));
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to connect module tutor';
      set({ error: errMsg });
    } finally {
      set({ aiSpeaking: false });
    }
  },

  sendModuleMessage: async (moduleId: string, messageText: string) => {
    const userMsg: TrainingMessage = {
      role: 'user',
      content: messageText.trim(),
      timestamp: Date.now(),
    };

    set((state) => {
      const currentMsgs = state.moduleMessages[moduleId] || [];
      return {
        moduleMessages: {
          ...state.moduleMessages,
          [moduleId]: [...currentMsgs, userMsg],
        },
        aiSpeaking: true,
        error: null,
      };
    });

    try {
      const response = await fetch('/api/training/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'module',
          moduleId,
          message: messageText.trim(),
        }),
      });

      if (!response.ok) throw new Error('Module tutor offline');

      const data = await response.json();
      const assistantMsg: TrainingMessage = {
        role: 'assistant',
        content: data.message,
        type: data.type || 'text',
        citations: data.citations || [],
        timestamp: Date.now(),
      };

      set((state) => {
        const currentMsgs = state.moduleMessages[moduleId] || [];
        return {
          moduleMessages: {
            ...state.moduleMessages,
            [moduleId]: [...currentMsgs, assistantMsg],
          },
        };
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Failed to get answer';
      set({ error: errMsg });
    } finally {
      set({ aiSpeaking: false });
    }
  },

  setAiSpeaking: (speaking: boolean) => {
    set({ aiSpeaking: speaking });
  },

  updateProgress: async (moduleId: string, updates: Partial<TrainingProgress>) => {
    const { progress } = get();

    // Actualizar localmente para feedback inmediato
    const updatedProgress = progress.map((p) =>
      p.moduleId === moduleId ? { ...p, ...updates } : p
    );
    set({ progress: updatedProgress });

    if (updates.timeSpent !== undefined && updates.timeSpent > 0) {
      try {
        await fetch('/api/training/update-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moduleId,
            minutesDelta: updates.timeSpent, // Usar delta correcto en lugar del absoluto anterior
          }),
        });
      } catch (err) {
        console.error('[TrainingStore] Error updating progress on server:', err);
      }
    }
  },

  reset: () => {
    set({
      employee: null,
      phase: 'welcome',
      currentModuleId: null,
      program: null,
      modules: [],
      progress: [],
      currentSession: null,
      generalMessages: [],
      moduleMessages: {},
      loading: false,
      aiSpeaking: false,
      error: null,
    });
  },
}));
