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
import {
  createInfoSession,
  fetchInfoSessionState,
  syncInfoSession,
} from '@/lib/info-sessions/client';
import type { InfoSessionClientStatus } from '@/lib/info-sessions/contracts';
import { createClient } from '@/utils/supabase/client';

/**
 * Cada cuánto se pregunta por el estado de la sesión mientras el cliente espera
 * al asesor.
 *
 * El Requisito 5 criterio 10 pide que el cliente se entere de que el asesor le
 * atendió dentro de los 10 segundos siguientes. 5 s deja margen para que una
 * petición lenta entre en la ventana y sigue siendo una carga trivial: son unas
 * pocas peticiones por sesión, solo mientras la pantalla de espera está abierta.
 */
const COACH_ATTENDANCE_POLL_INTERVAL_MS = 5_000;

/**
 * Estado que el asesor fija al atender la sesión desde su panel
 * (`coachStore.markSessionAttended`). El cliente no puede fijarlo —no está en
 * `INFO_SESSION_CLIENT_STATUSES`—, y por eso sirve como confirmación real.
 */
const COACH_ATTENDED_SESSION_STATUS = 'completed';

// ─── Estado de la sesión de informes (lado cliente público) ───
interface InfoSessionState {
  // Identificadores
  sessionId: string | null;
  /**
   * Credencial de escritura de ESTA sesión, emitida una sola vez por
   * `POST /api/info-sessions`.
   *
   * SOLO EN MEMORIA, a propósito: nada de `localStorage` ni de `sessionStorage`.
   * Es una credencial portadora que no caduca ni se puede revocar sin borrar la
   * fila, así que su vida útil se limita a la pestaña que la recibió. Si el
   * cliente recarga, la sesión anterior queda cerrada donde estaba y se crea una
   * nueva, que es lo que ya pasaba antes con `sessionId`.
   */
  accessToken: string | null;
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
  /**
   * El estado se acota a los tres valores que el cliente puede fijar. Antes era
   * `string`, y con la escritura en el servidor eso solo produciría peticiones
   * que la ruta rechaza: `completed` y `conversion_result` los fija el asesor.
   */
  updateSessionStatus: (status: InfoSessionClientStatus) => Promise<void>;
  watchCoachAttendance: () => () => void;

  // Reset
  reset: () => void;
}

const initialState = {
  sessionId: null,
  accessToken: null,
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

  /**
   * Carga el curso, sus módulos y sus planes con la CLAVE ANON, y así se queda.
   *
   * Es el único punto del store que sigue hablando con Supabase desde el
   * navegador, y es correcto: `courses`, `course_modules` y `course_plans` son el
   * contenido público de la oferta —lo mismo que ve cualquiera que abra
   * `/informes/{courseId}`—, acotado por `is_active = true`. No hay datos de
   * ningún cliente ahí, así que no hay nada que mover al servidor.
   */
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

  /**
   * Crea la sesión en el servidor y guarda la credencial que devuelve.
   *
   * Antes insertaba la fila con la clave anon, lo que exigía la política
   * `anon_insert_sessions` (`WITH CHECK (true)`). Dos cambios respecto a
   * entonces:
   *
   *  - NO envía `orgId`. Lo resuelve el servidor a partir del `courseId`. Un
   *    `org_id` que sale del navegador es un `org_id` elegible por el cliente, y
   *    bastaba cambiarlo para meter la sesión en el panel de otra organización.
   *  - Guarda el `accessToken`, sin el cual ninguna escritura posterior es
   *    posible.
   */
  createSession: async () => {
    const { courseId, clientName, clientEmail, clientPhone, clientAge, clientOccupation, courseFor } = get();
    if (!courseId) return null;

    const result = await createInfoSession({
      courseId,
      clientName,
      clientEmail,
      clientPhone,
      clientAge,
      clientOccupation,
      courseFor,
    });

    if (result.status !== 'created') {
      // Mismo comportamiento observable que antes: la página muestra su pantalla
      // de error y no entra a la sala. El motivo real queda en el servidor.
      set({ error: 'No pudimos iniciar la sesion informativa. Intenta de nuevo.' });
      return null;
    }

    set({ sessionId: result.sessionId, accessToken: result.accessToken });
    return result.sessionId;
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
  //
  // `startTimer` limpia el intervalo anterior antes de crear el nuevo.
  //
  // Sin esa guarda, dos llamadas dejaban el primer `setInterval` corriendo sin
  // referencia: `set({ timerInterval: interval })` sobrescribía la única forma de
  // pararlo, así que ni `stopTimer` ni nada podían alcanzarlo. El síntoma es un
  // temporizador que avanza al doble de velocidad.
  startTimer: () => {
    const { timerInterval: existing } = get();
    if (existing) clearInterval(existing);

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

  // ─── Sincronizar transcripción y objeciones (ruta de servidor) ───
  syncTranscript: async () => {
    const { sessionId, accessToken, transcript, objectionsDetected } = get();
    // Sin credencial no hay escritura posible: el `sessionId` por sí solo no
    // acredita nada en la ruta, así que ni se intenta.
    if (!sessionId || !accessToken) return;

    // Fallo silencioso, igual que antes: el cliente encadena esto con la
    // conversación y una transcripción sin guardar no debe interrumpirla. El
    // cliente HTTP no lanza y el servidor deja constancia del rechazo.
    //
    // La copia superficial de cada elemento no es adorno: el contrato valida los
    // turnos y las objeciones con `looseObject` para admitir campos futuros, así
    // que su tipo lleva una firma de índice que TypeScript no deduce para las
    // interfaces de `@/types/informes`. Copiarlos produce el mismo dato con un
    // tipo que sí la admite, sin conversión ni pérdida de campos.
    await syncInfoSession({
      sessionId,
      accessToken,
      patch: {
        transcript: transcript.map((entry) => ({ ...entry })),
        objectionsDetected: objectionsDetected.map((objection) => ({ ...objection })),
      },
    });
  },

  // ─── Actualizar estado y datos de cierre (ruta de servidor) ───
  updateSessionStatus: async (status: InfoSessionClientStatus) => {
    const { sessionId, accessToken, closingMode, clientEmail, clientPhone } = get();
    if (!sessionId || !accessToken) return;

    await syncInfoSession({
      sessionId,
      accessToken,
      patch: {
        status,
        closingMode,
        clientEmail,
        clientPhone,
      },
    });
  },

  /**
   * Sondea el estado de la sesión hasta detectar que el asesor la atendió.
   *
   * SUSTITUYE AL CANAL DE TIEMPO REAL. La suscripción anterior filtraba por
   * `id=eq.{sessionId}`, pero ese filtro solo acota lo que llega al navegador: para
   * ENTREGAR el evento, Realtime evalúa RLS, así que hacía falta `SELECT` para
   * `anon` sobre `info_sessions`. La política que lo permitía era
   * `anon_read_own_session USING (true)`, es decir lectura pública de todas las
   * sesiones de todas las organizaciones —con el nombre, el correo, el teléfono y
   * la transcripción de cada cliente—. Retirada esa política, el canal no puede
   * funcionar, y no hay forma de acotarlo por sesión: `USING` no ve la credencial
   * que el cliente guarda en memoria.
   *
   * El sondeo cada 5 s cumple el tope de 10 s del Requisito 5 criterio 10 y solo
   * lee la fila que acredita la credencial (`POST /api/info-sessions/state`).
   *
   * Deja de preguntar en cuanto lo detecta: el aviso es de una sola vez y seguir
   * sondeando una pantalla final sería tráfico sin destinatario.
   */
  watchCoachAttendance: () => {
    const { sessionId, accessToken } = get();
    if (!sessionId || !accessToken) return () => {};

    let watching = true;

    const interval: ReturnType<typeof setInterval> = setInterval(() => {
      void fetchInfoSessionState({ sessionId, accessToken }).then((state) => {
        // La limpieza pudo ejecutarse mientras la petición estaba en vuelo: sin
        // esta guarda, una respuesta tardía escribiría en un store que la pantalla
        // ya abandonó.
        if (!watching) return;
        if (state.status === 'ok' && state.sessionStatus === COACH_ATTENDED_SESSION_STATUS) {
          watching = false;
          clearInterval(interval);
          set({ coachAttended: true });
        }
      });
    }, COACH_ATTENDANCE_POLL_INTERVAL_MS);

    return () => {
      watching = false;
      clearInterval(interval);
    };
  },

  // ─── Reset ───
  reset: () => {
    const { timerInterval } = get();
    if (timerInterval) clearInterval(timerInterval);
    set({ ...initialState });
  },
}));
