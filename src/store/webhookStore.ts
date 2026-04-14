import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setWebhookUrl: (url: string) => void;
  setWebhookSecret: (secret: string) => void;
  addLog: (log: WebhookLog) => void;
  clearLogs: () => void;
}

export const useWebhookStore = create<WebhookState>()(
  persist(
    (set) => ({
      webhookUrl: '',
      webhookSecret: '',
      webhookLogs: [],

      setWebhookUrl: (webhookUrl: string) => set({ webhookUrl }),
      setWebhookSecret: (webhookSecret: string) => set({ webhookSecret }),
      addLog: (log: WebhookLog) =>
        set((state) => ({
          webhookLogs: [log, ...state.webhookLogs].slice(0, 10), // Keep last 10
        })),
      clearLogs: () => set({ webhookLogs: [] }),
    }),
    {
      name: 'worldbrain-webhooks',
    }
  )
);
