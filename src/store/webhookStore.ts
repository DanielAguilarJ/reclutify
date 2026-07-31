import { create } from 'zustand';
import {
  getWebhookConfig as getWebhookConfigAction,
  saveWebhookConfig as saveWebhookConfigAction,
} from '@/app/actions/webhook-config';

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

/**
 * Store de webhooks — caché en memoria con Supabase como fuente de verdad.
 * SIN persistencia en localStorage para garantizar sincronización cross-device.
 * Los logs de webhook sí son efímeros (solo de la sesión actual).
 */
export const useWebhookStore = create<WebhookState>()(
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

    // ─── Cargar configuración de webhook ───
    //
    // Pasa por una server action que NO devuelve el secreto de firma: lo sustituye por un
    // marcador. Antes era `select('*')` desde el navegador. Ver
    // `src/app/actions/webhook-config.ts`.
    fetchWebhookConfig: async () => {
      set({ loading: true });
      try {
        const config = await getWebhookConfigAction();
        set({ webhookUrl: config.url, webhookSecret: config.secret, loading: false });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error cargando webhook config:', err);
        }
        set({ loading: false });
      }
    },

    // ─── Guardar configuración de webhook ───
    //
    // El secreto viaja como marcador si el usuario no lo cambió, y la action conserva el
    // valor almacenado. Sin eso, guardar solo la URL sobrescribiría el secreto con la cadena
    // del marcador y el receptor rechazaría todas las firmas siguientes: el empleador
    // dejaría de recibir avisos sin saber por qué.
    syncWebhookConfig: async () => {
      try {
        const result = await saveWebhookConfigAction({
          url: get().webhookUrl,
          secret: get().webhookSecret,
        });

        if (!result.success && process.env.NODE_ENV === 'development') {
          console.error('Error guardando webhook config:', result.error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando webhook config:', err);
        }
      }
    },
  })
);
