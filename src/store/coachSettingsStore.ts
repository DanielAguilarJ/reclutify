import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/utils/supabase/client';
import type { CoachSettingsRow } from '@/app/actions/coach-settings';
import {
  getCoachSettings as getCoachSettingsAction,
  saveCoachSettings as saveCoachSettingsAction,
} from '@/app/actions/coach-settings-secure';


/**
 * Estrechamiento de los valores de unión que llegan de la base.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * `coach_settings.conversation_tone`, `session_language` y `default_closing_mode` son
 * columnas de TEXTO LIBRE en Postgres, pero el store las declara como uniones cerradas
 * (`'formal' | 'amigable' | 'entusiasta'`, etc.).
 *
 * Antes esa discrepancia estaba tapada: la fila llegaba de un `select('*')` sin tipo y los
 * campos entraban por asignación implícita. Al tipar la fila correctamente el compilador la
 * señaló, que es la señal de que el tipo anterior no comprobaba nada.
 *
 * Un valor inesperado —una migración a medias, una escritura manual en el panel de
 * Supabase— cae al defecto en lugar de propagar una cadena que el resto del código trata
 * como miembro válido de la unión. El síntoma que evita: un `switch` sobre el tono que no
 * coincide con ninguna rama y deja el prompt del asesor sin instrucciones de estilo.
 */
function narrowTo<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Valores válidos de cada columna de unión. */
const CONVERSATION_TONES = ['formal', 'amigable', 'entusiasta'] as const;
const SESSION_LANGUAGES = ['es', 'en'] as const;
const CLOSING_MODES = ['presential', 'remote', 'both'] as const;

/**
 * Normaliza el JSONB `integrations`, rellenando con los valores por defecto lo que falte.
 *
 * `as Integrations` a secas era una mentira: el JSONB puede venir vacío, a medias o con una
 * integración que aún no existía cuando se guardó, y cada acceso posterior habría dado
 * `undefined` en un campo declarado obligatorio.
 */
function normalizeIntegrations(raw: unknown, fallback: Integrations): Integrations {
  if (!raw || typeof raw !== 'object') return fallback;

  const source = raw as Partial<Integrations>;

  return {
    webhook: { ...fallback.webhook, ...source.webhook },
    google_sheets: { ...fallback.google_sheets, ...source.google_sheets },
    hubspot: { ...fallback.hubspot, ...source.hubspot },
    notion: { ...fallback.notion, ...source.notion },
  };
}

// ─── Types ───

export interface IntegrationWebhook {
  enabled: boolean;
  url: string;
  secret: string;
  events: string[];
}

export interface IntegrationGoogleSheets {
  enabled: boolean;
  spreadsheet_id: string;
  credentials: string;
  sheet_name: string;
}

export interface IntegrationHubspot {
  enabled: boolean;
  api_key: string;
  pipeline_id: string;
}

export interface IntegrationNotion {
  enabled: boolean;
  token: string;
  database_id: string;
}

export interface Integrations {
  webhook: IntegrationWebhook;
  google_sheets: IntegrationGoogleSheets;
  hubspot: IntegrationHubspot;
  notion: IntegrationNotion;
}

export interface CoachSettings {
  // AI Configuration
  assistantName: string;
  conversationTone: 'formal' | 'amigable' | 'entusiasta';
  sessionLanguage: 'es' | 'en';
  welcomeMessage: string;
  salesPersistence: number; // 1-3
  customInstructions: string;
  // Session Defaults
  defaultSessionDuration: number;
  /** Zona horaria IANA de la organización. Se guardaba en ningún sitio antes de existir esta clave. */
  timezone: string;
  defaultClosingMode: 'presential' | 'remote' | 'both';
  autoNotifyOnInvestment: boolean;
  notificationSound: boolean;
  // Email Notifications
  emailOnClosing: boolean;
  emailOnNewLead: boolean;
  emailOnObjection: boolean;
  emailDailySummary: boolean;
  additionalEmails: string[];
  // Public Page
  publicWelcomeMessage: string;
  showOrgName: boolean;
  accentColor: string;
  // Integrations
  integrations: Integrations;
}

interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface CoachSettingsState {
  settings: CoachSettings;
  teamMembers: TeamMember[];
  invitations: TeamInvitation[];
  orgId: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  setOrgId: (orgId: string) => void;
  fetchSettings: () => Promise<void>;
  updateSettings: (updates: Partial<CoachSettings>) => void;
  saveSettings: () => Promise<boolean>;
  updateIntegration: <K extends keyof Integrations>(key: K, data: Partial<Integrations[K]>) => void;

  // Team
  fetchTeam: () => Promise<void>;
  inviteMember: (email: string, role: string) => Promise<boolean>;
  removeMember: (userId: string) => Promise<boolean>;
  cancelInvitation: (invitationId: string) => Promise<boolean>;
}

const defaultSettings: CoachSettings = {
  assistantName: 'Asistente Virtual',
  conversationTone: 'amigable',
  sessionLanguage: 'es',
  welcomeMessage: '',
  salesPersistence: 2,
  customInstructions: '',
  defaultSessionDuration: 20,
  timezone: 'America/Mexico_City',
  defaultClosingMode: 'both',
  autoNotifyOnInvestment: true,
  notificationSound: true,
  emailOnClosing: true,
  emailOnNewLead: true,
  emailOnObjection: false,
  emailDailySummary: false,
  additionalEmails: [],
  publicWelcomeMessage: '',
  showOrgName: true,
  accentColor: '#D3FB52',
  integrations: {
    webhook: { enabled: false, url: '', secret: '', events: ['new_lead', 'closing_ready'] },
    google_sheets: { enabled: false, spreadsheet_id: '', credentials: '', sheet_name: 'Leads' },
    hubspot: { enabled: false, api_key: '', pipeline_id: '' },
    notion: { enabled: false, token: '', database_id: '' },
  },
};

export const useCoachSettingsStore = create<CoachSettingsState>()(
  persist(
    (set, get) => ({
      settings: { ...defaultSettings },
      teamMembers: [],
      invitations: [],
      orgId: null,
      loading: false,
      error: null,

      setOrgId: (orgId) => set({ orgId }),

      fetchSettings: async () => {
        const { orgId } = get();
        if (!orgId) return;

        set({ loading: true, error: null });
        try {
          // La lectura pasa por una server action que REDACTA los secretos de
          // integraciones antes de que salgan del servidor.
          //
          // Antes era `select('*')` desde el navegador, lo que enviaba al cliente el JSON
          // de la cuenta de servicio de Google (con su clave privada), el token de HubSpot,
          // el de Notion y el secreto del webhook. Son credenciales de sistemas de
          // TERCEROS: quien las captura hace daño en el CRM del cliente, no en el nuestro.
          // Ver `src/lib/coach/integration-secrets.ts`.
          const result = await getCoachSettingsAction(orgId);

          if (!result.success) {
            set({ error: result.error ?? 'No se pudo cargar la configuración', loading: false });
            return;
          }

          const data = result.data;

          if (!data) {
            // Organización sin configuración todavía: valores por defecto.
            set({ settings: { ...defaultSettings }, loading: false });
            return;
          }

          // `row` acota el acceso a la fila sin repetir el cast en cada campo.
          //
          // Se declara como parcial de la fila y no como `Record<string, never>`, que era
          // lo primero que escribí: `never` es asignable a todo, así que compilaba pero
          // describía una fila cuyos campos no pueden tener valor. Un tipo que miente pasa
          // la comprobación y no comprueba nada.
          const row = data as Partial<CoachSettingsRow> & Record<string, unknown>;
          const integrations = normalizeIntegrations(row.integrations, defaultSettings.integrations);

          set({
            settings: {
              assistantName: row.assistant_name || defaultSettings.assistantName,
              conversationTone: narrowTo(row.conversation_tone, CONVERSATION_TONES, defaultSettings.conversationTone),
              sessionLanguage: narrowTo(row.session_language, SESSION_LANGUAGES, defaultSettings.sessionLanguage),
              welcomeMessage: row.welcome_message || '',
              salesPersistence: row.sales_persistence ?? defaultSettings.salesPersistence,
              customInstructions: row.custom_instructions || '',
              defaultSessionDuration: row.default_session_duration ?? defaultSettings.defaultSessionDuration,
              // Se comprueba el tipo en vez de hacer `as string`: `database.types.ts` se genera
              // desde la base y todavía no conoce esta columna, así que aquí llega como
              // `unknown`. Un cast compilaría y no comprobaría nada.
              timezone:
                typeof row.timezone === 'string' && row.timezone.length > 0
                  ? row.timezone
                  : defaultSettings.timezone,
              defaultClosingMode: narrowTo(row.default_closing_mode, CLOSING_MODES, defaultSettings.defaultClosingMode),
              autoNotifyOnInvestment: row.auto_notify_on_investment ?? true,
              notificationSound: row.notification_sound ?? true,
              emailOnClosing: row.email_on_closing ?? true,
              emailOnNewLead: row.email_on_new_lead ?? true,
              emailOnObjection: row.email_on_objection ?? false,
              emailDailySummary: row.email_daily_summary ?? false,
              additionalEmails: row.additional_emails || [],
              publicWelcomeMessage: row.public_welcome_message || '',
              showOrgName: row.show_org_name ?? true,
              accentColor: row.accent_color || '#D3FB52',
              integrations: {
                webhook: integrations.webhook || defaultSettings.integrations.webhook,
                google_sheets: integrations.google_sheets || defaultSettings.integrations.google_sheets,
                hubspot: integrations.hubspot || defaultSettings.integrations.hubspot,
                notion: integrations.notion || defaultSettings.integrations.notion,
              },
            },
            loading: false,
          });
        } catch (err) {
          set({ error: (err as Error).message, loading: false });
        }
      },

      updateSettings: (updates) => {
        set((state) => ({
          settings: { ...state.settings, ...updates },
        }));
      },

      updateIntegration: (key, data) => {
        set((state) => ({
          settings: {
            ...state.settings,
            integrations: {
              ...state.settings.integrations,
              [key]: { ...state.settings.integrations[key], ...data },
            },
          },
        }));
      },

      saveSettings: async () => {
        const { orgId, settings } = get();
        if (!orgId) return false;

        try {
          // La escritura pasa por la server action, que recompone los secretos que el
          // cliente no cambió: el marcador `'__SAVED__'` conserva el valor almacenado. Sin
          // eso, pulsar «Guardar» sin tocar nada sobrescribiría la credencial real con el
          // marcador y el usuario destruiría su propia integración.
          const result = await saveCoachSettingsAction(orgId, {
              org_id: orgId,
              assistant_name: settings.assistantName,
              conversation_tone: settings.conversationTone,
              session_language: settings.sessionLanguage,
              welcome_message: settings.welcomeMessage,
              sales_persistence: settings.salesPersistence,
              custom_instructions: settings.customInstructions,
              default_session_duration: settings.defaultSessionDuration,
              timezone: settings.timezone,
              default_closing_mode: settings.defaultClosingMode,
              auto_notify_on_investment: settings.autoNotifyOnInvestment,
              notification_sound: settings.notificationSound,
              email_on_closing: settings.emailOnClosing,
              email_on_new_lead: settings.emailOnNewLead,
              email_on_objection: settings.emailOnObjection,
              email_daily_summary: settings.emailDailySummary,
              additional_emails: settings.additionalEmails,
              public_welcome_message: settings.publicWelcomeMessage,
              show_org_name: settings.showOrgName,
              accent_color: settings.accentColor,
              integrations: settings.integrations,
          });

          if (!result.success) {
            set({ error: result.error ?? 'No se pudo guardar la configuración' });
            return false;
          }

          return true;
        } catch (err) {
          set({ error: (err as Error).message });
          return false;
        }
      },

      // ─── Team Management ───

      fetchTeam: async () => {
        const { orgId } = get();
        if (!orgId) return;

        try {
          const supabase = createClient();

          // Fetch members
          const { data: members } = await supabase
            .from('org_members')
            .select('user_id, role, created_at')
            .eq('org_id', orgId);

          // Fetch user details for each member
          const teamMembers: TeamMember[] = [];
          if (members) {
            for (const m of members) {
              const { data: profile } = await supabase
                .from('user_profiles')
                .select('full_name')
                .eq('user_id', m.user_id)
                .single();

              teamMembers.push({
                userId: m.user_id,
                fullName: profile?.full_name || 'Sin nombre',
                email: '', // We'll get this from auth if needed
                role: m.role,
                joinedAt: m.created_at,
              });
            }
          }

          // Fetch pending invitations
          const { data: invites } = await supabase
            .from('team_invitations')
            .select('*')
            .eq('org_id', orgId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

          const invitations: TeamInvitation[] = (invites || []).map((inv) => ({
            id: inv.id,
            email: inv.email,
            role: inv.role,
            status: inv.status,
            createdAt: inv.created_at,
            expiresAt: inv.expires_at,
          }));

          set({ teamMembers, invitations });
        } catch (err) {
          set({ error: (err as Error).message });
        }
      },

      inviteMember: async (email, role) => {
        const { orgId } = get();
        if (!orgId) return false;

        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();

          const { error } = await supabase
            .from('team_invitations')
            .insert({
              org_id: orgId,
              email,
              role,
              invited_by: user?.id,
            });

          if (error) throw error;

          // Refresh invitations
          await get().fetchTeam();
          return true;
        } catch (err) {
          set({ error: (err as Error).message });
          return false;
        }
      },

      removeMember: async (userId) => {
        const { orgId } = get();
        if (!orgId) return false;

        try {
          const supabase = createClient();
          const { error } = await supabase
            .from('org_members')
            .delete()
            .eq('org_id', orgId)
            .eq('user_id', userId);

          if (error) throw error;
          await get().fetchTeam();
          return true;
        } catch (err) {
          set({ error: (err as Error).message });
          return false;
        }
      },

      cancelInvitation: async (invitationId) => {
        try {
          const supabase = createClient();
          const { error } = await supabase
            .from('team_invitations')
            .update({ status: 'cancelled' })
            .eq('id', invitationId);

          if (error) throw error;
          await get().fetchTeam();
          return true;
        } catch (err) {
          set({ error: (err as Error).message });
          return false;
        }
      },
    }),
    {
      name: 'reclutify-coach-settings',
      partialize: (state) => ({
        settings: {
          notificationSound: state.settings.notificationSound,
        },
      }),
    }
  )
);
