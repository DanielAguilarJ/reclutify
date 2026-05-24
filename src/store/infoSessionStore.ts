import { create } from 'zustand';
import type {
  InfoSessionPhase,
  InfoSessionTranscriptEntry,
  DetectedObjection,
  ClosingMode,
  Course,
  CourseModule,
  CoursePlan,
} from '@/types/informes';
import { createClient } from '@/utils/supabase/client';

// ─── Estado de la sesión de informes (lado cliente público) ───
interface InfoSessionState {
  // Identificadores
  sessionId: string | null;
  courseId: string | null;
  orgId: string | null;

  // Datos del curso cargado
  course: Course | null;
  modules: CourseModule[];
  plans: CoursePlan[];

  // Estado de la sesión
  phase: InfoSessionPhase;
  transcript: InfoSessionTranscriptEntry[];
  isLoading: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  error: string | null;

  // Datos del cliente
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAge: number | null;
  clientOccupation: string;
  courseFor: string;

  // Estado del cierre
  closingMode: ClosingMode | null;
  coachNotified: boolean;
  coachAttended: boolean;
  objectionsDetected: DetectedObjection[];

  // Timer
  timerSeconds: number;
  timerInterval: ReturnType<typeof setInterval> | null;

  // Acciones
  setCourseId: (courseId: string) => void;
  loadCourse: (courseId: string) => Promise<void>;
  setPhase: (phase: InfoSessionPhase) => void;
  setClientDetails: (details: {
    clientName: string;
    clientEmail?: string;
    clientPhone?: string;
    clientAge?: number | null;
    clientOccupation?: string;
    courseFor?: string;
  }) => void;
  createSession: () => Promise<string | null>;
  addTranscriptEntry: (entry: InfoSessionTranscriptEntry) => void;
  addObjection: (objection: DetectedObjection) => void;
  setClosingMode: (mode: ClosingMode) => void;
  setCoachNotified: (notified: boolean) => void;
  setCoachAttended: (attended: boolean) => void;
  setIsSpeaking: (speaking: boolean) => void;
  setIsListening: (listening: boolean) => void;
  setIsLoading: (loading: boolean) => void;

  // Timer
  startTimer: () => void;
  stopTimer: () => void;

  // Sync
  syncTranscript: () => Promise<void>;
  updateSessionStatus: (status: string) => Promise<void>;
  subscribeToSessionUpdates: () => () => void;

  // Reset
  reset: () => void;
}

const initialState = {
  sessionId: null,
  courseId: null,
  orgId: null,
  course: null,
  modules: [],
  plans: [],
  phase: 'select' as InfoSessionPhase,
  transcript: [],
  isLoading: false,
  isSpeaking: false,
  isListening: false,
  error: null,
  clientName: '',
  clientEmail: '',
  clientPhone: '',
  clientAge: null,
  clientOccupation: '',
  courseFor: '',
  closingMode: null,
  coachNotified: false,
  coachAttended: false,
  objectionsDetected: [],
  timerSeconds: 0,
  timerInterval: null,
};

export const useInfoSessionStore = create<InfoSessionState>((set, get) => ({
  ...initialState,

  setCourseId: (courseId) => set({ courseId }),

  loadCourse: async (courseId: string) => {
    set({ isLoading: true, error: null });
    try {
      const supabase = createClient();

      // Fetch course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .eq('is_active', true)
        .single();

      if (courseError || !courseData) throw new Error('Curso no encontrado');

      // Fetch modules
      const { data: modulesData } = await supabase
        .from('course_modules')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      // Fetch plans
      const { data: plansData } = await supabase
        .from('course_plans')
        .select('*')
        .eq('course_id', courseId)
        .order('order_index', { ascending: true });

      const course: Course = {
        id: courseData.id,
        orgId: courseData.org_id,
        name: courseData.name,
        description: courseData.description || '',
        objectives: courseData.objectives || [],
        benefits: courseData.benefits || [],
        targetAudience: courseData.target_audience || '',
        durationInfo: courseData.duration_info || '',
        modality: courseData.modality || 'presencial',
        sessionDuration: courseData.session_duration || 20,
        topics: courseData.topics || [],
        objectionResponses: courseData.objection_responses || {},
        testimonials: courseData.testimonials || [],
        urgencyHooks: courseData.urgency_hooks || [],
        isActive: courseData.is_active,
        createdAt: new Date(courseData.created_at).getTime(),
        updatedAt: new Date(courseData.updated_at).getTime(),
      };

      const modules: CourseModule[] = (modulesData || []).map((m) => ({
        id: m.id,
        courseId: m.course_id,
        title: m.title,
        description: m.description || '',
        orderIndex: m.order_index,
      }));

      const plans: CoursePlan[] = (plansData || []).map((p) => ({
        id: p.id,
        courseId: p.course_id,
        name: p.name,
        price: Number(p.price),
        currency: p.currency || 'MXN',
        features: p.features || [],
        isRecommended: p.is_recommended || false,
        orderIndex: p.order_index,
      }));

      set({
        course,
        modules,
        plans,
        courseId,
        orgId: course.orgId,
        isLoading: false,
      });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  setPhase: (phase) => set({ phase }),

  setClientDetails: (details) => set({
    clientName: details.clientName,
    clientEmail: details.clientEmail || '',
    clientPhone: details.clientPhone || '',
    clientAge: details.clientAge ?? null,
    clientOccupation: details.clientOccupation || '',
    courseFor: details.courseFor || '',
  }),

  createSession: async () => {
    const { courseId, orgId, clientName, clientEmail, clientPhone, clientAge, clientOccupation, courseFor } = get();
    if (!courseId || !orgId) return null;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('info_sessions')
        .insert({
          course_id: courseId,
          org_id: orgId,
          client_name: clientName,
          client_email: clientEmail,
          client_phone: clientPhone,
          client_age: clientAge,
          client_occupation: clientOccupation,
          course_for: courseFor,
          status: 'active',
        })
        .select('id')
        .single();

      if (error) throw error;
      set({ sessionId: data.id });
      return data.id;
    } catch (err) {
      set({ error: (err as Error).message });
      return null;
    }
  },

  addTranscriptEntry: (entry) => {
    set((state) => ({
      transcript: [...state.transcript, entry],
    }));
  },

  addObjection: (objection) => {
    set((state) => ({
      objectionsDetected: [...state.objectionsDetected, objection],
    }));
  },

  setClosingMode: (mode) => set({ closingMode: mode }),
  setCoachNotified: (notified) => set({ coachNotified: notified }),
  setCoachAttended: (attended) => set({ coachAttended: attended }),
  setIsSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setIsListening: (listening) => set({ isListening: listening }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  // ─── Timer ───
  startTimer: () => {
    const interval = setInterval(() => {
      set((state) => ({ timerSeconds: state.timerSeconds + 1 }));
    }, 1000);
    set({ timerInterval: interval });
  },

  stopTimer: () => {
    const { timerInterval } = get();
    if (timerInterval) {
      clearInterval(timerInterval);
      set({ timerInterval: null });
    }
  },

  // ─── Sync transcript to Supabase ───
  syncTranscript: async () => {
    const { sessionId, transcript, objectionsDetected } = get();
    if (!sessionId) return;

    try {
      const supabase = createClient();
      await supabase
        .from('info_sessions')
        .update({
          transcript,
          objections_detected: objectionsDetected,
        })
        .eq('id', sessionId);
    } catch {
      // Silent fail for transcript sync
    }
  },

  // ─── Update session status ───
  updateSessionStatus: async (status: string) => {
    const { sessionId, closingMode, clientEmail, clientPhone } = get();
    if (!sessionId) return;

    try {
      const supabase = createClient();
      await supabase
        .from('info_sessions')
        .update({
          status,
          closing_mode: closingMode,
          client_email: clientEmail,
          client_phone: clientPhone,
        })
        .eq('id', sessionId);
    } catch {
      // Silent fail
    }
  },

  // ─── Subscribe to session updates (for coach attended notification) ───
  subscribeToSessionUpdates: () => {
    const { sessionId } = get();
    if (!sessionId) return () => {};

    const supabase = createClient();
    const channel = supabase
      .channel(`info-session-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'info_sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const newData = payload.new as Record<string, unknown>;
          if (newData.status === 'completed') {
            set({ coachAttended: true });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },

  // ─── Reset ───
  reset: () => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);
    set({ ...initialState });
  },
}));
