import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'es';
export type PlanTier = 'starter' | 'pro' | 'enterprise';

interface AppState {
  language: Language;
  planTier: PlanTier;
  setLanguage: (lang: Language) => void;
  setPlanTier: (plan: PlanTier) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      language: 'en', // default language
      planTier: 'starter', // default tier
      setLanguage: (language) => set({ language }),
      setPlanTier: (planTier) => set({ planTier }),
    }),
    {
      name: 'worldbrain-app-store',
    }
  )
);
