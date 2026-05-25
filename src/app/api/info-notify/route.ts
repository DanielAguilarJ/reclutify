import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, orgId, clientName, courseName, type } = await req.json();

    if (!sessionId || !orgId || !type) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, orgId, type' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase configuration missing' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ─── Build notification data ───
    const notificationTitle = type === 'closing_ready'
      ? `Cliente listo para cierre: ${clientName || 'Desconocido'}`
      : `Nuevo lead: ${clientName || 'Desconocido'}`;

    const notificationMessage = type === 'closing_ready'
      ? `${clientName || 'Un cliente'} esta interesado en "${courseName || 'tu programa'}" y solicita hablar contigo. La sesion de informes indica alta intencion de compra.`
      : `${clientName || 'Un cliente'} ha completado una sesion de informes sobre "${courseName || 'tu programa'}". Revisa los detalles para hacer seguimiento.`;

    // ─── 1. Insert notification into coach_notifications ───
    const { error: notifError } = await supabase
      .from('coach_notifications')
      .insert({
        id: crypto.randomUUID(),
        org_id: orgId,
        session_id: sessionId,
        type,
        title: notificationTitle,
        message: notificationMessage,
        read: false,
        created_at: new Date().toISOString(),
      });

    if (notifError) {
      console.error('Failed to insert notification:', notifError);
      return NextResponse.json(
        { error: 'Failed to create notification', details: notifError.message },
        { status: 500 }
      );
    }

    // ─── 2. Update info_sessions to mark coach_notified ───
    const { error: sessionError } = await supabase
      .from('info_sessions')
      .update({
        coach_notified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (sessionError) {
      console.error('Failed to update session:', sessionError);
      // Non-fatal: notification was already created, continue with email
    }

    // ─── 3. Look up org admin email ───
    let adminEmail: string | null = null;
    let adminName: string | null = null;

    // First try org_members for the owner/admin role
    const { data: orgMembers, error: membersError } = await supabase
      .from('org_members')
      .select('user_id, role')
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin'])
      .limit(1);

    if (!membersError && orgMembers && orgMembers.length > 0) {
      const adminUserId = orgMembers[0].user_id;

      // Get email from auth.users using admin API
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(adminUserId);

      if (!userError && userData?.user) {
        adminEmail = userData.user.email || null;
        adminName = userData.user.user_metadata?.full_name || userData.user.user_metadata?.name || null;
      }
    }

    // ─── 4. Send email notification via Resend ───
    let emailSent = false;
    const resendApiKey = process.env.RESEND_API_KEY;

    if (adminEmail && resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);

        const subjectLine = type === 'closing_ready'
          ? `🔔 ${clientName || 'Un cliente'} quiere inscribirse en "${courseName}"`
          : `📋 Nuevo lead interesado en "${courseName}"`;

        const emailHtml = buildNotificationEmail({
          type,
          clientName: clientName || 'Cliente',
          courseName: courseName || 'Tu programa',
          adminName: adminName || 'Coach',
          sessionId,
        });

        const { error: emailError } = await resend.emails.send({
          from: 'Reclutify <notificaciones@reclutify.com>',
          to: adminEmail,
          subject: subjectLine,
          html: emailHtml,
        });

        if (emailError) {
          console.error('Resend email error:', emailError);
        } else {
          emailSent = true;
        }
      } catch (emailErr) {
        console.error('Failed to send email:', emailErr);
      }
    } else {
      if (!adminEmail) console.warn('No admin email found for org:', orgId);
      if (!resendApiKey) console.warn('RESEND_API_KEY not configured');
    }

    // ─── 5. Trigger CRM integrations asynchronously ───
    triggerCRMIntegrations(supabase, orgId, {
      clientName: clientName || 'Cliente',
      courseName: courseName || 'Programa',
      sessionId,
      type,
    }).catch(err => console.error('[CRM integrations error]', err));

    return NextResponse.json({
      success: true,
      notificationCreated: true,
      sessionUpdated: !sessionError,
      emailSent,
      adminEmail: adminEmail ? `${adminEmail.substring(0, 3)}...` : null,
    });
  } catch (error) {
    console.error('info-notify error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── Email HTML Builder ───
function buildNotificationEmail(params: {
  type: 'closing_ready' | 'new_lead';
  clientName: string;
  courseName: string;
  adminName: string;
  sessionId: string;
}): string {
  const { type, clientName, courseName, adminName, sessionId } = params;

  const isClosing = type === 'closing_ready';

  const headerColor = isClosing ? '#D3FB52' : '#3B82F6';
  const headerText = isClosing ? 'Cliente Listo para Cierre' : 'Nuevo Lead Captado';
  const bodyText = isClosing
    ? `<strong>${clientName}</strong> ha completado una sesion de informes sobre <strong>"${courseName}"</strong> y ha mostrado alta intencion de compra. El cliente solicita hablar contigo directamente para finalizar su inscripcion.`
    : `<strong>${clientName}</strong> ha participado en una sesion de informes sobre <strong>"${courseName}"</strong>. Aunque no cerro en la sesion, dejo sus datos para seguimiento. Te recomendamos contactarlo en las proximas 24-48 horas.`;

  const ctaText = isClosing ? 'Ver Sesion y Contactar' : 'Ver Detalles del Lead';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f9fafb;">
  <div style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="background:${headerColor};padding:24px 32px;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:${isClosing ? '#1a1a1a' : '#ffffff'};">
        ${headerText}
      </h1>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">
        Hola ${adminName},
      </p>
      <p style="margin:0 0 24px;font-size:14px;color:#374151;line-height:1.6;">
        ${bodyText}
      </p>

      <!-- Details Card -->
      <div style="background:#f3f4f6;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0;font-size:12px;color:#6b7280;">Cliente</td>
            <td style="padding:4px 0;font-size:12px;color:#111827;font-weight:600;text-align:right;">${clientName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:12px;color:#6b7280;">Programa</td>
            <td style="padding:4px 0;font-size:12px;color:#111827;font-weight:600;text-align:right;">${courseName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:12px;color:#6b7280;">Tipo</td>
            <td style="padding:4px 0;font-size:12px;color:#111827;font-weight:600;text-align:right;">${isClosing ? 'Cierre Presencial' : 'Seguimiento Remoto'}</td>
          </tr>
          <tr>
            <td style="padding:4px 0;font-size:12px;color:#6b7280;">ID Sesion</td>
            <td style="padding:4px 0;font-size:11px;color:#6b7280;text-align:right;font-family:monospace;">${sessionId.substring(0, 8)}...</td>
          </tr>
        </table>
      </div>

      <!-- CTA Button -->
      <a href="https://app.reclutify.com/coach/leads" style="display:block;text-align:center;background:${headerColor};color:${isClosing ? '#1a1a1a' : '#ffffff'};font-size:14px;font-weight:600;padding:12px 24px;border-radius:10px;text-decoration:none;">
        ${ctaText}
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:16px 32px;border-top:1px solid #f3f4f6;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        Esta notificacion fue generada automaticamente por Reclutify. No responder a este correo.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── CRM Integrations Trigger ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function triggerCRMIntegrations(supabase: any, orgId: string, leadData: {
  clientName: string;
  courseName: string;
  sessionId: string;
  type: string;
}) {
  // Load coach_settings to get integrations config
  const { data: settings } = await supabase
    .from('coach_settings')
    .select('integrations, additional_emails, email_on_new_lead, email_on_closing')
    .eq('org_id', orgId)
    .single();

  if (!settings?.integrations) return;

  const integrations = settings.integrations as {
    webhook?: { enabled: boolean; url: string; secret: string; events: string[] };
    google_sheets?: { enabled: boolean; spreadsheet_id: string; credentials: string; sheet_name: string };
    hubspot?: { enabled: boolean; api_key: string; pipeline_id: string };
    notion?: { enabled: boolean; token: string; database_id: string };
  };

  // Get full session data for CRM
  const { data: session } = await supabase
    .from('info_sessions')
    .select('*')
    .eq('id', leadData.sessionId)
    .single();

  const eventType = leadData.type === 'closing_ready' ? 'closing_ready' : 'new_lead';

  // ─── Webhook ───
  if (integrations.webhook?.enabled && integrations.webhook.url) {
    const events = integrations.webhook.events || [];
    if (events.includes(eventType)) {
      try {
        const payload = JSON.stringify({
          event: eventType,
          timestamp: new Date().toISOString(),
          data: {
            clientName: leadData.clientName,
            clientEmail: session?.client_email || '',
            clientPhone: session?.client_phone || '',
            clientAge: session?.client_age,
            clientOccupation: session?.client_occupation || '',
            courseFor: session?.course_for || '',
            courseName: leadData.courseName,
            sessionId: leadData.sessionId,
            closingMode: session?.closing_mode,
            conversionResult: session?.conversion_result,
          },
        });

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (integrations.webhook.secret) {
          const crypto = await import('crypto');
          const signature = crypto.createHmac('sha256', integrations.webhook.secret)
            .update(payload)
            .digest('hex');
          headers['X-Webhook-Signature'] = `sha256=${signature}`;
        }

        await fetch(integrations.webhook.url, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(10000),
        });
      } catch (err) {
        console.error('[Webhook integration error]', err);
      }
    }
  }

  // ─── HubSpot ───
  if (integrations.hubspot?.enabled && integrations.hubspot.api_key) {
    try {
      await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${integrations.hubspot.api_key}`,
        },
        body: JSON.stringify({
          properties: {
            email: session?.client_email || `lead-${Date.now()}@placeholder.com`,
            firstname: leadData.clientName.split(' ')[0] || '',
            lastname: leadData.clientName.split(' ').slice(1).join(' ') || '',
            phone: session?.client_phone || '',
            jobtitle: session?.client_occupation || '',
            hs_lead_status: eventType === 'closing_ready' ? 'OPEN_DEAL' : 'NEW',
            company: leadData.courseName,
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error('[HubSpot integration error]', err);
    }
  }

  // ─── Notion ───
  if (integrations.notion?.enabled && integrations.notion.token && integrations.notion.database_id) {
    try {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${integrations.notion.token}`,
          'Notion-Version': '2022-06-28',
        },
        body: JSON.stringify({
          parent: { database_id: integrations.notion.database_id },
          properties: {
            'Nombre': { title: [{ text: { content: leadData.clientName } }] },
            'Email': { email: session?.client_email || null },
            'Telefono': { phone_number: session?.client_phone || null },
            'Curso': { rich_text: [{ text: { content: leadData.courseName } }] },
            'Estado': { select: { name: eventType === 'closing_ready' ? 'Listo para cerrar' : 'Nuevo lead' } },
            'Fecha': { date: { start: new Date().toISOString() } },
          },
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      console.error('[Notion integration error]', err);
    }
  }

  // ─── Google Sheets ───
  if (integrations.google_sheets?.enabled && integrations.google_sheets.spreadsheet_id && integrations.google_sheets.credentials) {
    try {
      // Parse service account credentials
      const creds = JSON.parse(integrations.google_sheets.credentials);
      const now = Math.floor(Date.now() / 1000);

      // Create JWT for Google API
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const claimSet = Buffer.from(JSON.stringify({
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      })).toString('base64url');

      const crypto = await import('crypto');
      const signInput = `${header}.${claimSet}`;
      const signature = crypto.createSign('RSA-SHA256')
        .update(signInput)
        .sign(creds.private_key, 'base64url');

      const jwt = `${signInput}.${signature}`;

      // Exchange JWT for access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
        signal: AbortSignal.timeout(10000),
      });

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;
        const sheetName = integrations.google_sheets.sheet_name || 'Leads';
        const spreadsheetId = integrations.google_sheets.spreadsheet_id;

        // Append row to sheet
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!A:I:append?valueInputOption=USER_ENTERED`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              values: [[
                new Date().toISOString(),
                leadData.clientName,
                session?.client_email || '',
                session?.client_phone || '',
                session?.client_age || '',
                session?.client_occupation || '',
                session?.course_for || '',
                leadData.courseName,
                eventType === 'closing_ready' ? 'Listo para cerrar' : 'Nuevo lead',
              ]],
            }),
            signal: AbortSignal.timeout(10000),
          }
        );
      }
    } catch (err) {
      console.error('[Google Sheets integration error]', err);
    }
  }

  // ─── Send to additional emails if configured ───
  if (settings.additional_emails?.length > 0) {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      const shouldSend = (eventType === 'new_lead' && settings.email_on_new_lead) ||
                         (eventType === 'closing_ready' && settings.email_on_closing);
      if (shouldSend) {
        try {
          const resend = new Resend(resendApiKey);
          for (const email of settings.additional_emails) {
            await resend.emails.send({
              from: 'Reclutify <notificaciones@reclutify.com>',
              to: email,
              subject: `[Reclutify] ${eventType === 'closing_ready' ? 'Cliente listo para cierre' : 'Nuevo lead'}: ${leadData.clientName}`,
              html: `<p><strong>${leadData.clientName}</strong> - ${leadData.courseName}</p><p>Tipo: ${eventType === 'closing_ready' ? 'Cierre presencial' : 'Nuevo lead'}</p><p><a href="https://app.reclutify.com/coach/leads">Ver en Reclutify</a></p>`,
            });
          }
        } catch (err) {
          console.error('[Additional emails error]', err);
        }
      }
    }
  }
}
