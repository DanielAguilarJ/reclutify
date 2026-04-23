import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/utils/supabase/client';

export interface WebhookLog {
  id: string;
  timestamp: number;
  status: 'success' | 'error' | 'pending';
  responseCode: number | null;
  payload: string;  // JSON stringified summary
}

interface WebhookState {
  webhookUrl: string;
  webhookSecret: string;
  webhookLogs: WebhookLog[];
  loading: boolean;

  setWebhookUrl: (url: string) => void;
  setWebhookSecret: (secret: string) => void;
  addLog: (log: WebhookLog) => void;
  clearLogs: () => void;

  // Sincronización con Supabase
  fetchWebhookConfig: () => Promise<void>;
  syncWebhookConfig: () => Promise<void>;
}

export const useWebhookStore = create<WebhookState>()(
  persist(
    (set, get) => ({
      webhookUrl: '',
      webhookSecret: '',
      webhookLogs: [],
      loading: false,

      setWebhookUrl: (webhookUrl: string) => set({ webhookUrl }),
      setWebhookSecret: (webhookSecret: string) => set({ webhookSecret }),
      addLog: (log: WebhookLog) =>
        set((state) => ({
          webhookLogs: [log, ...state.webhookLogs].slice(0, 10), // Mantener últimos 10
        })),
      clearLogs: () => set({ webhookLogs: [] }),

      // ─── Cargar configuración de webhook desde Supabase ───
      fetchWebhookConfig: async () => {
        set({ loading: true });
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            set({ loading: false });
            return;
          }

          const { data: profile } = await supabase
            .from('user_profiles')
            .select('org_id')
            .eq('user_id', user.id)
            .single();

          if (!profile?.org_id) {
            set({ loading: false });
            return;
          }

          const { data, error } = await supabase
            .from('webhook_configs')
            .select('*')
            .eq('org_id', profile.org_id)
            .single();

          if (data && !error) {
            set({
              webhookUrl: data.webhook_url || '',
              webhookSecret: data.webhook_secret || '',
              loading: false,
            });
          } else {
            set({ loading: false });
          }
        } catch (err) {
          console.error('Error cargando webhook config:', err);
          set({ loading: false });
        }
      },

      // ─── Guardar configuración de webhook en Supabase ───
      syncWebhookConfig: async () => {
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: profile } = await supabase
            .from('user_profiles')
            .select('org_id')
            .eq('user_id', user.id)
            .single();

          if (!profile?.org_id) return;

          const { error } = await supabase
            .from('webhook_configs')
            .upsert({
              org_id: profile.org_id,
              webhook_url: get().webhookUrl,
              webhook_secret: get().webhookSecret,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'org_id' });

          if (error) {
            console.error('Error guardando webhook config:', error);
          }
        } catch (err) {
          console.error('Error sincronizando webhook config:', err);
        }
      },
    }),
    {
      name: 'worldbrain-webhooks',
    }
  )
);
