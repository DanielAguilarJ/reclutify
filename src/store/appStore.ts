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

function applyThemeToDOM(theme: Theme) {
  if (typeof window !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      language: 'es', // default language
      planTier: 'starter', // default tier
      theme: 'light', // default theme
      setLanguage: (language) => set({ language }),
      setPlanTier: (planTier) => set({ planTier }),
      setTheme: (theme) => {
        applyThemeToDOM(theme);
        set({ theme });
      },
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        applyThemeToDOM(newTheme);
        set({ theme: newTheme });
      },
    }),
    {
      name: 'reclutify-app-store',
      onRehydrateStorage: () => (state) => {
        // Apply theme on hydration (only client-side)
        if (state?.theme) {
          applyThemeToDOM(state.theme);
        }
      },
    }
  )
);
