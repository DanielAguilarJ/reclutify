'use server';

import { createClient } from '@/utils/supabase/server';
import { Resend } from 'resend';

// ─── Types ───

interface CoachSettingsRow {
  org_id: string;
  assistant_name: string | null;
  conversation_tone: string | null;
  session_language: string | null;
  welcome_message: string | null;
  sales_persistence: number | null;
  custom_instructions: string | null;
  default_session_duration: number | null;
  default_closing_mode: string | null;
  auto_notify_on_investment: boolean | null;
  notification_sound: boolean | null;
  email_on_closing: boolean | null;
  email_on_new_lead: boolean | null;
  email_on_objection: boolean | null;
  email_daily_summary: boolean | null;
  additional_emails: string[] | null;
  public_welcome_message: string | null;
  show_org_name: boolean | null;
  accent_color: string | null;
  integrations: Record<string, unknown> | null;
}

interface TeamMember {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  joinedAt: string;
}

interface GetSettingsResult {
  success: boolean;
  data?: CoachSettingsRow;
  error?: string;
}

interface GetTeamResult {
  success: boolean;
  members?: TeamMember[];
  error?: string;
}

interface SendInvitationResult {
  success: boolean;
  error?: string;
}

// ─── Get Coach Settings ───

export async function getCoachSettings(orgId: string): Promise<GetSettingsResult> {
  if (!orgId) {
    return { success: false, error: 'Organization ID is required.' };
  }

  try {
    const supabase = await createClient();

    // Verify user has access to this org
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'No autenticado.' };
    }

    // Check membership: either via user_profiles.org_id or org_members
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('user_id', user.id)
      .single();

    let hasAccess = profile?.org_id === orgId;

    if (!hasAccess) {
      const { data: membership } = await supabase
        .from('org_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .maybeSingle();

      hasAccess = !!membership;
    }

    if (!hasAccess) {
      return { success: false, error: 'No tienes acceso a esta organización.' };
    }

    // Fetch settings
    const { data, error } = await supabase
      .from('coach_settings')
      .select('*')
      .eq('org_id', orgId)
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings row — return null data (use defaults on client)
      return { success: true, data: undefined };
    }

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as CoachSettingsRow };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Get Team Members ───

export async function getTeamMembers(): Promise<GetTeamResult> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'No autenticado.' };
    }

    // Get user's org from profile
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .single();

    if (!profile?.org_id) {
      return { success: false, error: 'No se encontró la organización del usuario.' };
    }

    const orgId = profile.org_id;

    // Fetch all members of this org
    const { data: members, error: membersError } = await supabase
      .from('org_members')
      .select('user_id, role, created_at')
      .eq('org_id', orgId);

    if (membersError) {
      return { success: false, error: membersError.message };
    }

    if (!members || members.length === 0) {
      return { success: true, members: [] };
    }

    // Fetch user profiles for all members
    const userIds = members.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, email')
      .in('user_id', userIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, { fullName: p.full_name || '', email: p.email || '' }])
    );

    const teamMembers: TeamMember[] = members.map((m) => {
      const profileInfo = profileMap.get(m.user_id);
      return {
        userId: m.user_id,
        fullName: profileInfo?.fullName || 'Sin nombre',
        email: profileInfo?.email || '',
        role: m.role,
        joinedAt: m.created_at,
      };
    });

    return { success: true, members: teamMembers };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─── Send Team Invitation Email ───

export async function sendTeamInvitationEmail(
  email: string,
  orgName: string
): Promise<SendInvitationResult> {
  if (!email || !orgName) {
    return { success: false, error: 'Email y nombre de organización son requeridos.' };
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) {
    console.warn('RESEND_API_KEY not configured. Skipping email send.');
    return { success: true }; // Don't block invitation if email service is unavailable
  }

  try {
    const supabase = await createClient();

    // Verify user is authenticated and get their info
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: 'No autenticado.' };
    }

    // Get inviter's name
    const { data: inviterProfile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .single();

    const inviterName = inviterProfile?.full_name || 'Un miembro del equipo';

    const resend = new Resend(resendApiKey);

    const { error: emailError } = await resend.emails.send({
      from: 'Reclutify <noreply@reclutify.com>',
      to: [email],
      subject: `${inviterName} te ha invitado a unirte a ${orgName} en Reclutify`,
      html: `
        <!DOCTYPE html>
        <html lang="es">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                line-height: 1.6;
                color: #1f2937;
                background-color: #f9fafb;
                margin: 0;
                padding: 40px 20px;
              }
              .container {
                max-width: 560px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 40px;
                border: 1px solid #f3f4f6;
                border-radius: 16px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
              }
              .logo {
                text-align: center;
                margin-bottom: 32px;
              }
              .logo h1 {
                color: #111827;
                font-size: 24px;
                font-weight: 800;
                letter-spacing: -0.5px;
                margin: 0;
              }
              h2 {
                color: #111827;
                font-size: 20px;
                margin-top: 0;
                margin-bottom: 16px;
              }
              p {
                font-size: 15px;
                color: #4b5563;
                margin-bottom: 20px;
              }
              .highlight {
                background-color: #f0fdf4;
                border-left: 4px solid #D3FB52;
                padding: 16px 20px;
                border-radius: 0 12px 12px 0;
                margin: 24px 0;
              }
              .highlight p {
                margin: 0;
                font-weight: 500;
                color: #166534;
              }
              .button-wrapper {
                text-align: center;
                margin: 32px 0;
              }
              .button {
                display: inline-block;
                padding: 14px 32px;
                background-color: #D3FB52;
                color: #111827 !important;
                text-decoration: none;
                border-radius: 10px;
                font-weight: 600;
                font-size: 15px;
              }
              .footer {
                margin-top: 32px;
                padding-top: 20px;
                border-top: 1px solid #f3f4f6;
                font-size: 12px;
                color: #9ca3af;
                text-align: center;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="logo">
                <h1>Reclutify</h1>
              </div>
              <h2>Te han invitado a un equipo</h2>
              <p><strong>${inviterName}</strong> te ha invitado a unirte al equipo de <strong>${orgName}</strong> en Reclutify.</p>
              
              <div class="highlight">
                <p>Al aceptar, podrás colaborar en la gestión de cursos, leads y sesiones de coaching con IA.</p>
              </div>

              <div class="button-wrapper">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.reclutify.com'}/invite/accept" class="button">Aceptar Invitación</a>
              </div>

              <p style="font-size: 13px; text-align: center; color: #6b7280;">
                Si no esperabas esta invitación, puedes ignorar este correo.
              </p>

              <div class="footer">
                <p>Reclutify &mdash; Coaching de ventas con IA</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return { success: false, error: `Error al enviar email: ${emailError.message}` };
    }

    return { success: true };
  } catch (err) {
    console.error('sendTeamInvitationEmail error:', err);
    return { success: false, error: (err as Error).message };
  }
}
