import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { InterviewTicket } from '@/types';

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

interface TicketState {
  tickets: InterviewTicket[];
  addTicket: (candidateName: string, roleId: string, language: 'en' | 'es') => InterviewTicket;
  markTicketUsed: (token: string) => void;
  getTicketByToken: (token: string) => InterviewTicket | undefined;
}

export const useTicketStore = create<TicketState>()(
  persist(
    (set, get) => ({
      tickets: [],

      addTicket: (candidateName: string, roleId: string, language: 'en' | 'es') => {
        const now = Date.now();
        const ticket: InterviewTicket = {
          id: `ticket-${now}`,
          token: generateToken(),
          candidateName,
          roleId,
          language,
          createdAt: now,
          expiresAt: now + 24 * 60 * 60 * 1000, // 24 hours
          used: false,
        };
        set((state) => ({ tickets: [ticket, ...state.tickets] }));
        return ticket;
      },

      markTicketUsed: (token: string) =>
        set((state) => ({
          tickets: state.tickets.map((t) =>
            t.token === token ? { ...t, used: true } : t
          ),
        })),

      getTicketByToken: (token: string) =>
        get().tickets.find((t) => t.token === token),
    }),
    {
      name: 'worldbrain-tickets',
    }
  )
);
