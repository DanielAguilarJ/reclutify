import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@/utils/supabase/client';

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
          const supabase = createClient();
          const { data, error } = await supabase
            .from('coach_settings')
            .select('*')
            .eq('org_id', orgId)
            .single();

          if (error && error.code === 'PGRST116') {
            // No settings yet — create defaults
            const { error: insertError } = await supabase
              .from('coach_settings')
              .insert({ org_id: orgId });

            if (insertError) throw insertError;
            set({ settings: { ...defaultSettings }, loading: false });
            return;
          }

          if (error) throw error;

          if (data) {
            const integrations = (data.integrations as Integrations) || defaultSettings.integrations;
            set({
              settings: {
                assistantName: data.assistant_name || defaultSettings.assistantName,
                conversationTone: data.conversation_tone || defaultSettings.conversationTone,
                sessionLanguage: data.session_language || defaultSettings.sessionLanguage,
                welcomeMessage: data.welcome_message || '',
                salesPersistence: data.sales_persistence ?? defaultSettings.salesPersistence,
                customInstructions: data.custom_instructions || '',
                defaultSessionDuration: data.default_session_duration ?? defaultSettings.defaultSessionDuration,
                defaultClosingMode: data.default_closing_mode || defaultSettings.defaultClosingMode,
                autoNotifyOnInvestment: data.auto_notify_on_investment ?? true,
                notificationSound: data.notification_sound ?? true,
                emailOnClosing: data.email_on_closing ?? true,
                emailOnNewLead: data.email_on_new_lead ?? true,
                emailOnObjection: data.email_on_objection ?? false,
                emailDailySummary: data.email_daily_summary ?? false,
                additionalEmails: data.additional_emails || [],
                publicWelcomeMessage: data.public_welcome_message || '',
                showOrgName: data.show_org_name ?? true,
                accentColor: data.accent_color || '#D3FB52',
                integrations: {
                  webhook: integrations.webhook || defaultSettings.integrations.webhook,
                  google_sheets: integrations.google_sheets || defaultSettings.integrations.google_sheets,
                  hubspot: integrations.hubspot || defaultSettings.integrations.hubspot,
                  notion: integrations.notion || defaultSettings.integrations.notion,
                },
              },
              loading: false,
            });
          }
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
          const supabase = createClient();
          const { error } = await supabase
            .from('coach_settings')
            .upsert({
              org_id: orgId,
              assistant_name: settings.assistantName,
              conversation_tone: settings.conversationTone,
              session_language: settings.sessionLanguage,
              welcome_message: settings.welcomeMessage,
              sales_persistence: settings.salesPersistence,
              custom_instructions: settings.customInstructions,
              default_session_duration: settings.defaultSessionDuration,
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
            }, { onConflict: 'org_id' });

          if (error) throw error;
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
