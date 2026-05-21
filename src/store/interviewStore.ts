import { create } from 'zustand';
import type { Candidate, Topic, TranscriptEntry, InterviewPhase } from '@/types';

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
  setScreenStream: (screenStream) => set({ screenStream }),
  reset: () => set(initialState),
}));
