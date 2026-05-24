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
