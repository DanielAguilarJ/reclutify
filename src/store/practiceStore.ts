import { create } from 'zustand';
import type { TranscriptEntry, Evaluation } from '@/types';

interface PracticeTopic {
  label: string;
  status: 'pending' | 'current' | 'completed';
  rubric?: {
    weight: number;
    excellent: string;
    acceptable: string;
    poor: string;
  };
}

interface PracticeState {
  phase: 'setup' | 'interview' | 'evaluating' | 'results';
  roleTitle: string;
  roleDescription: string;
  topics: PracticeTopic[];
  currentTopicIndex: number;
  transcript: TranscriptEntry[];
  evaluation: Evaluation | null;
  language: 'en' | 'es';

  setPhase: (phase: PracticeState['phase']) => void;
  setRoleTitle: (title: string) => void;
  setRoleDescription: (desc: string) => void;
  setTopics: (topics: PracticeTopic[]) => void;
  setLanguage: (lang: 'en' | 'es') => void;
  addTranscriptEntry: (entry: TranscriptEntry) => void;
  nextTopic: () => void;
  setEvaluation: (evaluation: Evaluation) => void;
  reset: () => void;
}

const initialState = {
  phase: 'setup' as const,
  roleTitle: '',
  roleDescription: '',
  topics: [] as PracticeTopic[],
  currentTopicIndex: 0,
  transcript: [] as TranscriptEntry[],
  evaluation: null as Evaluation | null,
  language: 'es' as const,
};

export const usePracticeStore = create<PracticeState>()((set, get) => ({
  ...initialState,

  setPhase: (phase) => set({ phase }),
  setRoleTitle: (roleTitle) => set({ roleTitle }),
  setRoleDescription: (roleDescription) => set({ roleDescription }),
  setTopics: (topics) => set({ topics }),
  setLanguage: (language) => set({ language }),

  addTranscriptEntry: (entry) =>
    set((state) => ({ transcript: [...state.transcript, entry] })),

  nextTopic: () =>
    set((state) => {
      const topics = [...state.topics];
      const currentIdx = state.currentTopicIndex;
      
      if (topics[currentIdx]) {
        topics[currentIdx] = { ...topics[currentIdx], status: 'completed' };
      }
      
      const nextIdx = currentIdx + 1;
      if (nextIdx < topics.length) {
        topics[nextIdx] = { ...topics[nextIdx], status: 'current' };
      }
      
      return { topics, currentTopicIndex: nextIdx };
    }),

  setEvaluation: (evaluation) => set({ evaluation }),

  reset: () => set({ ...initialState }),
}));
