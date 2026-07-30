import { create } from 'zustand';
import type { Candidate, Topic, TranscriptEntry, InterviewPhase, InterviewMode } from '@/types';
import type { CandidateResultAccessProof } from '@/lib/candidate-results/access-proof-contracts';

interface InterviewState {
  phase: InterviewPhase;
  candidate: Candidate;
  topics: Topic[];
  currentTopicIndex: number;
  transcript: TranscriptEntry[];
  timerSeconds: number;
  isAiSpeaking: boolean;
  currentSubtitle: string;
  isRecording: boolean;
  isProcessing: boolean;
  roleId: string | null;
  screenStream: MediaStream | null;
  interviewDuration: number; // Duración de la entrevista en minutos
  interviewMode: InterviewMode;
  selectedCameraId: string | null;
  selectedMicId: string | null;
  /**
   * Prueba de acceso de la entrevista en curso: el `token` del ticket o el
   * `public_token` de la vacante, según por dónde haya entrado el candidato.
   *
   * POR QUÉ VIVE AQUÍ
   * -----------------
   * `/api/candidate-results` ya no acepta escrituras sin credencial, y quien la
   * conoce es la página de entrada (`/interview/t/[token]` y
   * `/interview/public/[publicToken]`), mientras que quien escribe es
   * `adminStore` (`upsertCandidateResult` / `patchCandidateResult`), invocado
   * desde `InterviewRoom` e `InterviewComplete`. Pasarla como prop por esa cadena
   * obligaría a atravesar componentes que no tienen nada que ver; este store ya
   * es el estado de la entrevista en curso y `adminStore` lo puede leer con
   * `getState()` en el momento de cada petición — incluidos los reintentos de
   * `retrySyncQueue`.
   *
   * POR QUÉ NO SE PERSISTE
   * ----------------------
   * Es una credencial, y en memoria vive exactamente lo que dura la sesión de la
   * entrevista. La cola de reintento (`localStorage`) no la guarda a propósito:
   * quien la vacía de verdad es el panel autenticado al cargar el dashboard
   * (`fetchFromSupabase` llama a `retrySyncQueue`), y ahí la credencial es la
   * sesión de la organización, no el token del candidato. Guardar el token en
   * disco alargaría su vida hasta 14 días sin que ningún camino real lo
   * aprovechara.
   */
  accessProof: CandidateResultAccessProof | null;

  setPhase: (phase: InterviewPhase) => void;
  setCandidate: (candidate: Candidate) => void;
  setTopics: (topics: Topic[]) => void;
  nextTopic: () => void;
  addTranscriptEntry: (entry: TranscriptEntry) => void;
  setTimerSeconds: (updater: number | ((prev: number) => number)) => void;
  setIsAiSpeaking: (speaking: boolean) => void;
  setCurrentSubtitle: (subtitle: string) => void;
  setIsRecording: (recording: boolean) => void;
  setIsProcessing: (processing: boolean) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  setRoleId: (roleId: string | null) => void;
  setScreenStream: (stream: MediaStream | null) => void;
  setInterviewDuration: (minutes: number) => void;
  setInterviewMode: (mode: InterviewMode) => void;
  setSelectedCameraId: (id: string | null) => void;
  setSelectedMicId: (id: string | null) => void;
  setAccessProof: (proof: CandidateResultAccessProof | null) => void;
  reset: () => void;
}

const initialState = {
  phase: 'details' as InterviewPhase,
  candidate: { name: '', email: '', phone: '' },
  topics: [],
  currentTopicIndex: 0,
  transcript: [],
  timerSeconds: 0,
  isAiSpeaking: false,
  currentSubtitle: '',
  isRecording: false,
  isProcessing: false,
  sessionId: null,
  roleId: null,
  screenStream: null,
  interviewDuration: 30, // Default: 30 minutos
  interviewMode: 'restricted' as InterviewMode,
  selectedCameraId: null,
  selectedMicId: null,
  accessProof: null as CandidateResultAccessProof | null,
};

export const useInterviewStore = create<InterviewState>((set) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),
  setCandidate: (candidate) => set({ candidate }),
  setTopics: (topics) => set({ topics }),
  nextTopic: () =>
    set((state) => ({
      currentTopicIndex: Math.min(state.currentTopicIndex + 1, state.topics.length - 1),
    })),
  addTranscriptEntry: (entry) =>
    set((state) => ({
      transcript: [...state.transcript, entry],
    })),
  setTimerSeconds: (updater) =>
    set((state) => ({
      timerSeconds: typeof updater === 'function' ? updater(state.timerSeconds) : updater,
    })),
  setIsAiSpeaking: (isAiSpeaking) => set({ isAiSpeaking }),
  setCurrentSubtitle: (currentSubtitle) => set({ currentSubtitle }),
  setIsRecording: (isRecording) => set({ isRecording }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setSessionId: (sessionId) => set({ sessionId }),
  setRoleId: (roleId) => set({ roleId }),
  setInterviewDuration: (interviewDuration) => set({ interviewDuration }),
  setInterviewMode: (interviewMode) => set({ interviewMode }),
  setScreenStream: (screenStream) => set({ screenStream }),
  setSelectedCameraId: (selectedCameraId) => set({ selectedCameraId }),
  setSelectedMicId: (selectedMicId) => set({ selectedMicId }),
  setAccessProof: (accessProof) => set({ accessProof }),
  reset: () => set(initialState),
}));
