import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'en' | 'es';
export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type Theme = 'light' | 'dark';

interface AppState {
  language: Language;
  planTier: PlanTier;
  theme: Theme;
  setLanguage: (lang: Language) => void;
  setPlanTier: (plan: PlanTier) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      language: 'en', // default language
      planTier: 'starter', // default tier
      theme: 'light', // default theme
      setLanguage: (language) => set({ language }),
      setPlanTier: (planTier) => set({ planTier }),
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        set({ theme: newTheme });
      },
    }),
    {
      name: 'reclutify-app-store',
      onRehydrateStorage: () => (state) => {
        // Apply theme on hydration
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
