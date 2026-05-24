import { create } from 'zustand';
import type { Course, CourseModule, CoursePlan, InfoSession, CoachNotification } from '@/types/informes';
import { createClient } from '@/utils/supabase/client';

// ─── Tipos de estado del store ───
interface CoachState {
  // Datos principales
  courses: Course[];
  leads: InfoSession[];
  activeSessions: InfoSession[];
  notifications: CoachNotification[];
  orgId: string | null;

  // Estados de carga
  loading: boolean;
  error: string | null;

  // Acciones de cursos
  addCourse: (course: Course, modules: CourseModule[], plans: CoursePlan[]) => Promise<void>;
  updateCourse: (id: string, updates: Partial<Course>) => Promise<void>;
  removeCourse: (id: string) => Promise<void>;
  toggleCourseActive: (id: string) => Promise<void>;

  // Acciones de sesiones
  fetchLeads: () => Promise<void>;
  fetchActiveSessions: () => Promise<void>;
  markSessionAttended: (sessionId: string) => Promise<void>;

  // Acciones de notificaciones
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  unreadCount: () => number;

  // Realtime
  subscribeToRealtime: () => () => void;

  // Sincronización con Supabase
  fetchFromSupabase: () => Promise<void>;
  setOrgId: (orgId: string) => void;
}

/**
 * Helper: Convierte un curso del formato de Supabase al formato de la app
 */
function courseFromSupabase(row: Record<string, unknown>): Course {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    description: (row.description as string) || '',
    objectives: (row.objectives as string[]) || [],
    benefits: (row.benefits as string[]) || [],
    targetAudience: (row.target_audience as string) || '',
    durationInfo: (row.duration_info as string) || '',
    modality: (row.modality as Course['modality']) || 'presencial',
    sessionDuration: (row.session_duration as number) || 20,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    topics: (row.topics as any) || [],
    objectionResponses: (row.objection_responses as Record<string, string>) || {},
    testimonials: (row.testimonials as string[]) || [],
    urgencyHooks: (row.urgency_hooks as string[]) || [],
    isActive: (row.is_active as boolean) || false,
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

/**
 * Helper: Convierte un curso al formato de Supabase
 */
function courseToSupabase(course: Course, orgId: string) {
  return {
    id: course.id,
    org_id: orgId,
    name: course.name,
    description: course.description,
    objectives: course.objectives,
    benefits: course.benefits,
    target_audience: course.targetAudience,
    duration_info: course.durationInfo,
    modality: course.modality,
    session_duration: course.sessionDuration,
    topics: course.topics,
    objection_responses: course.objectionResponses,
    testimonials: course.testimonials,
    urgency_hooks: course.urgencyHooks,
    is_active: course.isActive,
  };
}

/**
 * Helper: Convierte una sesión de Supabase al formato de la app
 */
function sessionFromSupabase(row: Record<string, unknown>): InfoSession {
  return {
    id: row.id as string,
    courseId: row.course_id as string,
    orgId: row.org_id as string,
    clientName: (row.client_name as string) || '',
    clientEmail: (row.client_email as string) || '',
    clientPhone: (row.client_phone as string) || '',
    clientAge: (row.client_age as number) || null,
    clientOccupation: (row.client_occupation as string) || '',
    courseFor: (row.course_for as string) || '',
    status: (row.status as InfoSession['status']) || 'active',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transcript: (row.transcript as any) || [],
    closingMode: (row.closing_mode as InfoSession['closingMode']) || null,
    coachNotified: (row.coach_notified as boolean) || false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    objectionsDetected: (row.objections_detected as any) || [],
    conversionResult: (row.conversion_result as InfoSession['conversionResult']) || 'pending',
    sessionMetadata: (row.session_metadata as Record<string, unknown>) || {},
    createdAt: new Date(row.created_at as string).getTime(),
    updatedAt: new Date(row.updated_at as string).getTime(),
  };
}

function notificationFromSupabase(row: Record<string, unknown>): CoachNotification {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    sessionId: (row.session_id as string) || null,
    type: row.type as CoachNotification['type'],
    title: (row.title as string) || '',
    message: (row.message as string) || '',
    read: (row.read as boolean) || false,
    createdAt: new Date(row.created_at as string).getTime(),
  };
}

export const useCoachStore = create<CoachState>((set, get) => ({
  courses: [],
  leads: [],
  activeSessions: [],
  notifications: [],
  orgId: null,
  loading: false,
  error: null,

  setOrgId: (orgId: string) => set({ orgId }),

  // ─── Fetch completo desde Supabase ───
  fetchFromSupabase: async () => {
    const { orgId } = get();
    if (!orgId) return;

    set({ loading: true, error: null });
    try {
      const supabase = createClient();

      const { data: coursesData, error: coursesError } = await supabase
        .from('courses')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (coursesError) throw coursesError;

      const courses = (coursesData || []).map(courseFromSupabase);
      set({ courses, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  // ─── Agregar curso ───
  addCourse: async (course, modules, plans) => {
    const { orgId } = get();
    if (!orgId) return;

    // Optimistic update
    set((state) => ({ courses: [course, ...state.courses] }));

    try {
      const supabase = createClient();

      const { error: courseError } = await supabase
        .from('courses')
        .insert(courseToSupabase(course, orgId));

      if (courseError) throw courseError;

      // Insert modules
      if (modules.length > 0) {
        const { error: modulesError } = await supabase
          .from('course_modules')
          .insert(modules.map(m => ({
            id: m.id,
            course_id: course.id,
            title: m.title,
            description: m.description,
            order_index: m.orderIndex,
          })));
        if (modulesError) throw modulesError;
      }

      // Insert plans
      if (plans.length > 0) {
        const { error: plansError } = await supabase
          .from('course_plans')
          .insert(plans.map(p => ({
            id: p.id,
            course_id: course.id,
            name: p.name,
            price: p.price,
            currency: p.currency,
            features: p.features,
            is_recommended: p.isRecommended,
            order_index: p.orderIndex,
          })));
        if (plansError) throw plansError;
      }
    } catch (err) {
      // Revert optimistic update
      set((state) => ({ courses: state.courses.filter(c => c.id !== course.id) }));
      set({ error: (err as Error).message });
    }
  },

  // ─── Actualizar curso ───
  updateCourse: async (id, updates) => {
    const { orgId } = get();
    if (!orgId) return;

    const prev = get().courses.find(c => c.id === id);
    if (!prev) return;

    // Optimistic update
    set((state) => ({
      courses: state.courses.map(c => c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c),
    }));

    try {
      const supabase = createClient();
      const dbUpdates: Record<string, unknown> = {};

      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.description !== undefined) dbUpdates.description = updates.description;
      if (updates.objectives !== undefined) dbUpdates.objectives = updates.objectives;
      if (updates.benefits !== undefined) dbUpdates.benefits = updates.benefits;
      if (updates.targetAudience !== undefined) dbUpdates.target_audience = updates.targetAudience;
      if (updates.durationInfo !== undefined) dbUpdates.duration_info = updates.durationInfo;
      if (updates.modality !== undefined) dbUpdates.modality = updates.modality;
      if (updates.sessionDuration !== undefined) dbUpdates.session_duration = updates.sessionDuration;
      if (updates.topics !== undefined) dbUpdates.topics = updates.topics;
      if (updates.objectionResponses !== undefined) dbUpdates.objection_responses = updates.objectionResponses;
      if (updates.testimonials !== undefined) dbUpdates.testimonials = updates.testimonials;
      if (updates.urgencyHooks !== undefined) dbUpdates.urgency_hooks = updates.urgencyHooks;
      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      const { error } = await supabase
        .from('courses')
        .update(dbUpdates)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      // Revert
      set((state) => ({
        courses: state.courses.map(c => c.id === id ? prev : c),
      }));
      set({ error: (err as Error).message });
    }
  },

  // ─── Eliminar curso ───
  removeCourse: async (id) => {
    const prev = get().courses;
    set((state) => ({ courses: state.courses.filter(c => c.id !== id) }));

    try {
      const supabase = createClient();
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) throw error;
    } catch (err) {
      set({ courses: prev, error: (err as Error).message });
    }
  },

  // ─── Toggle curso activo ───
  toggleCourseActive: async (id) => {
    const course = get().courses.find(c => c.id === id);
    if (!course) return;
    await get().updateCourse(id, { isActive: !course.isActive });
  },

  // ─── Fetch leads (sesiones cerradas modo remoto) ───
  fetchLeads: async () => {
    const { orgId } = get();
    if (!orgId) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('info_sessions')
        .select('*')
        .eq('org_id', orgId)
        .in('status', ['closed_remote', 'completed', 'closed_presential'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ leads: (data || []).map(sessionFromSupabase) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // ─── Fetch sesiones activas ───
  fetchActiveSessions: async () => {
    const { orgId } = get();
    if (!orgId) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('info_sessions')
        .select('*')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ activeSessions: (data || []).map(sessionFromSupabase) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // ─── Marcar sesión como atendida ───
  markSessionAttended: async (sessionId) => {
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('info_sessions')
        .update({ status: 'completed', conversion_result: 'converted' })
        .eq('id', sessionId);

      if (error) throw error;

      set((state) => ({
        activeSessions: state.activeSessions.filter(s => s.id !== sessionId),
      }));
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  // ─── Notificaciones ───
  fetchNotifications: async () => {
    const { orgId } = get();
    if (!orgId) return;

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('coach_notifications')
        .select('*')
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      set({ notifications: (data || []).map(notificationFromSupabase) });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  markNotificationRead: async (id) => {
    set((state) => ({
      notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
    }));

    try {
      const supabase = createClient();
      await supabase.from('coach_notifications').update({ read: true }).eq('id', id);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  markAllNotificationsRead: async () => {
    const { orgId } = get();
    if (!orgId) return;

    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
    }));

    try {
      const supabase = createClient();
      await supabase
        .from('coach_notifications')
        .update({ read: true })
        .eq('org_id', orgId)
        .eq('read', false);
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  unreadCount: () => {
    return get().notifications.filter(n => !n.read).length;
  },

  // ─── Realtime subscriptions ───
  subscribeToRealtime: () => {
    const { orgId } = get();
    if (!orgId) return () => {};

    const supabase = createClient();

    const channel = supabase
      .channel(`coach-realtime-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'coach_notifications',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const notification = notificationFromSupabase(payload.new as Record<string, unknown>);
          set((state) => ({
            notifications: [notification, ...state.notifications],
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'info_sessions',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const session = sessionFromSupabase(payload.new as Record<string, unknown>);
            if (session.status === 'active') {
              set((state) => ({
                activeSessions: [session, ...state.activeSessions],
              }));
            }
          } else if (payload.eventType === 'UPDATE') {
            const session = sessionFromSupabase(payload.new as Record<string, unknown>);
            set((state) => {
              if (session.status === 'active') {
                const exists = state.activeSessions.find(s => s.id === session.id);
                if (exists) {
                  return { activeSessions: state.activeSessions.map(s => s.id === session.id ? session : s) };
                }
                return { activeSessions: [session, ...state.activeSessions] };
              } else {
                // Session no longer active — remove from active list
                return { activeSessions: state.activeSessions.filter(s => s.id !== session.id) };
              }
            });
          }
        }
      )
      .subscribe();

    // Return unsubscribe function
    return () => {
      supabase.removeChannel(channel);
    };
  },
}));
