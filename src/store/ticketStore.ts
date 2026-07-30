import { create } from 'zustand';
import type { InterviewTicket } from '@/types';
import { generateInviteToken } from '@/lib/invites/token';
import { createClient } from '@/utils/supabase/client';

interface TicketState {
  tickets: InterviewTicket[];
  loading: boolean;
  error: string | null;

  addTicket: (candidateName: string, roleId: string, language: 'en' | 'es') => InterviewTicket;

  // Sincronización con Supabase
  fetchTickets: () => Promise<void>;
  syncAddTicket: (ticket: InterviewTicket) => Promise<void>;
}

/**
 * Store de tickets del PANEL AUTENTICADO — caché en memoria con Supabase como
 * fuente de verdad. SIN persistencia en localStorage para garantizar
 * sincronización cross-device.
 *
 * ALCANCE: solo `/admin/tickets` y `/admin/create-role`, ambos con sesión. Sus
 * consultas van con la clave anon más la sesión del usuario, así que las
 * políticas `org_tickets_select` y `org_tickets_insert` las acotan a la
 * organización de quien mira.
 *
 * LO QUE YA NO ESTÁ AQUÍ. La pantalla del candidato (`/interview/t/[token]`)
 * usaba este store para dos cosas que ahora hacen rutas de servidor con
 * `service_role`:
 *
 *  - `fetchTicketByToken`: `SELECT * FROM interview_tickets WHERE token = ...`
 *    con la clave anon. Devolvía la fila completa —incluido el token— y para
 *    funcionar necesitaba la política `public_ticket_by_token`
 *    (`SELECT TO anon USING (true)`), que al ser pública permitía a cualquiera
 *    listar los tokens de todos los candidatos. Sustituida por
 *    `POST /api/interview/ticket`.
 *  - `syncMarkUsed`: `UPDATE interview_tickets SET used = true` con la clave
 *    anon, apoyado en `anon_tickets_update` (`UPDATE TO anon USING (true)`), que
 *    permitía invalidar tickets ajenos. Sustituida por
 *    `POST /api/interview/ticket/consume`.
 *
 * Con ellas se fueron `getTicketByToken` y `markTicketUsed`, las dos ayudas de
 * caché local que solo consumía esa pantalla. El flujo del candidato ya no
 * mantiene estado de tickets en el navegador: lo pide al servidor.
 */
export const useTicketStore = create<TicketState>()(
  (set) => ({
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

    // ─── Crear ticket: store local (retorno inmediato) ───
    addTicket: (candidateName: string, roleId: string, language: 'en' | 'es') => {
      const now = Date.now();
      const ticket: InterviewTicket = {
        id: `ticket-${now}`,
        // Mismo generador que usa la ruta de invitaciones: el token es la
        // credencial de acceso a la entrevista, así que sale del CSPRNG de la
        // plataforma y no de `Math.random()`.
        token: generateInviteToken(),
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
  })
);
