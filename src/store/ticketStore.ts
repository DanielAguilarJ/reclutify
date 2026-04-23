import { create } from 'zustand';
import type { InterviewTicket } from '@/types';
import { createClient } from '@/utils/supabase/client';

// Generar token único de 8 caracteres alfanuméricos
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
  loading: boolean;
  error: string | null;

  addTicket: (candidateName: string, roleId: string, language: 'en' | 'es') => InterviewTicket;
  markTicketUsed: (token: string) => void;
  getTicketByToken: (token: string) => InterviewTicket | undefined;

  // Sincronización con Supabase
  fetchTickets: () => Promise<void>;
  fetchTicketByToken: (token: string) => Promise<InterviewTicket | null>;
  syncAddTicket: (ticket: InterviewTicket) => Promise<void>;
  syncMarkUsed: (token: string) => Promise<void>;
}

/**
 * Store de tickets — caché en memoria con Supabase como fuente de verdad.
 * SIN persistencia en localStorage para garantizar sincronización cross-device.
 */
export const useTicketStore = create<TicketState>()(
  (set, get) => ({
    tickets: [],
    loading: false,
    error: null,

    // ─── Cargar todos los tickets desde Supabase ───
    fetchTickets: async () => {
      set({ loading: true, error: null });
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('interview_tickets')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          if (process.env.NODE_ENV === 'development') {
            console.error('Error cargando tickets:', error);
          }
          set({ loading: false, error: error.message });
          return;
        }

        if (data) {
          const tickets: InterviewTicket[] = data.map((row) => ({
            id: row.id,
            token: row.token,
            candidateName: row.candidate_name,
            roleId: row.role_id,
            language: row.language as 'en' | 'es',
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            used: row.used,
          }));
          set({ tickets, loading: false });
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error en fetchTickets:', err);
        }
        set({ loading: false, error: 'Error cargando tickets' });
      }
    },

    // ─── Buscar un ticket por token en Supabase (para candidatos sin auth) ───
    fetchTicketByToken: async (token: string) => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('interview_tickets')
          .select('*')
          .eq('token', token)
          .single();

        if (error || !data) return null;

        const ticket: InterviewTicket = {
          id: data.id,
          token: data.token,
          candidateName: data.candidate_name,
          roleId: data.role_id,
          language: data.language as 'en' | 'es',
          createdAt: data.created_at,
          expiresAt: data.expires_at,
          used: data.used,
        };

        // Agregar al store local si no existe
        const existing = get().tickets.find((t) => t.token === token);
        if (!existing) {
          set((state) => ({ tickets: [ticket, ...state.tickets] }));
        }

        return ticket;
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error buscando ticket por token:', err);
        }
        return null;
      }
    },

    // ─── Crear ticket: store local (retorno inmediato) ───
    addTicket: (candidateName: string, roleId: string, language: 'en' | 'es') => {
      const now = Date.now();
      const ticket: InterviewTicket = {
        id: `ticket-${now}`,
        token: generateToken(),
        candidateName,
        roleId,
        language,
        createdAt: now,
        expiresAt: now + 24 * 60 * 60 * 1000, // 24 horas
        used: false,
      };
      set((state) => ({ tickets: [ticket, ...state.tickets] }));
      return ticket;
    },

    // ─── Sincronizar nuevo ticket con Supabase (llamar después de addTicket) ───
    syncAddTicket: async (ticket: InterviewTicket) => {
      try {
        const supabase = createClient();

        // Obtener orgId del usuario actual
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (!profile?.org_id) return;

        const { error } = await supabase
          .from('interview_tickets')
          .upsert({
            id: ticket.id,
            token: ticket.token,
            candidate_name: ticket.candidateName,
            role_id: ticket.roleId,
            language: ticket.language,
            created_at: ticket.createdAt,
            expires_at: ticket.expiresAt,
            used: ticket.used,
            org_id: profile.org_id,
          });

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error guardando ticket en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando ticket:', err);
        }
      }
    },

    // ─── Marcar ticket como usado: store local ───
    markTicketUsed: (token: string) =>
      set((state) => ({
        tickets: state.tickets.map((t) =>
          t.token === token ? { ...t, used: true } : t
        ),
      })),

    // ─── Sincronizar marca de usado con Supabase ───
    syncMarkUsed: async (token: string) => {
      try {
        const supabase = createClient();
        const { error } = await supabase
          .from('interview_tickets')
          .update({ used: true })
          .eq('token', token);

        if (error && process.env.NODE_ENV === 'development') {
          console.error('Error actualizando ticket en Supabase:', error);
        }
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error sincronizando ticket usado:', err);
        }
      }
    },

    getTicketByToken: (token: string) =>
      get().tickets.find((t) => t.token === token),
  })
);
