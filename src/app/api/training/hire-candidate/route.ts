import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';
import { createOpaqueToken, hashOpaqueToken } from '@/lib/training/tokens';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    // 1. Validar variables de entorno de red
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      return NextResponse.json(
        { error: 'NEXT_PUBLIC_APP_URL is not configured' },
        { status: 500 }
      );
    }

    // 2. Autenticar administrador
    const user = await requireAuthenticatedUser();

    const body = await req.json();
    const { candidateResultId, programId } = body;

    if (!candidateResultId || !programId) {
      return NextResponse.json(
        { error: 'Missing required fields: candidateResultId, programId' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 3. Cargar candidato para obtener correo y nombre y asegurar que existe
    const { data: candidate, error: candError } = await admin
      .from('candidate_results')
      .select('*')
      .eq('id', candidateResultId)
      .maybeSingle();

    if (candError || !candidate) {
      console.error('[Hire API] Candidate not found:', candError);
      return NextResponse.json({ error: 'Candidate result not found' }, { status: 404 });
    }

    // 4. Generar token opaco criptográfico y su hash
    const invitationToken = createOpaqueToken();
    const invitationTokenHash = hashOpaqueToken(invitationToken);
    const accessExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 días

    // 5. Llamar RPC transaccional
    const { data: employeeId, error: rpcError } = await admin.rpc('hire_training_candidate', {
      p_actor_user_id: user.id,
      p_candidate_result_id: candidateResultId,
      p_program_id: programId,
      p_access_token_hash: invitationTokenHash,
      p_access_expires_at: accessExpiresAt,
    });

    if (rpcError) {
      console.error('[Hire API] SQL RPC Transaction failed:', rpcError);
      return NextResponse.json(
        { error: `Transaction failed: ${rpcError.message}` },
        { status: 400 }
      );
    }

    // 6. Cargar el empleado creado
    const { data: employee, error: empLoadError } = await admin
      .from('training_employees')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (empLoadError || !employee) {
      console.error('[Hire API] Error reloading hired employee:', empLoadError);
      return NextResponse.json({ error: 'Employee was created but record could not be loaded' }, { status: 500 });
    }

    // 7. Generar notas de personalización vía AI (opcional/no-bloqueante)
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL || 'google/gemini-2.5-flash';

    if (OPENROUTER_API_KEY && employee.interview_data) {
      try {
        const aiPrompt = `Based on the following interview evaluation data for a new employee, generate personalization notes for their training program. The employee "${employee.name}" was hired for the role "${employee.role_title || ''}".

INTERVIEW DATA:
${JSON.stringify(employee.interview_data, null, 2)}

Return a JSON object with this exact structure (strengths, areasToWatch, customTips must be arrays of strings):
{
  "strengths": ["Strength 1", "Strength 2"],
  "areasToWatch": ["Area 1", "Area 2"],
  "learningStyle": "Inferred learning style preferences...",
  "customTips": ["Tip 1", "Tip 2"]
}

Respond ONLY with valid JSON.`;

        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://reclutify.com',
            'X-Title': 'Reclutify Training Center',
          },
          body: JSON.stringify({
            model: TRAINING_AI_MODEL,
            messages: [{ role: 'user', content: aiPrompt }],
            temperature: 0.5,
            response_format: { type: 'json_object' },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '{}';
          const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
          const structured = JSON.parse(cleanContent);

          // Normalizar arrays
          const strengths = Array.isArray(structured.strengths) ? structured.strengths : [structured.strengths].filter(Boolean);
          const areasToWatch = Array.isArray(structured.areasToWatch) ? structured.areasToWatch : [structured.areasToWatch].filter(Boolean);
          const customTips = Array.isArray(structured.customTips) ? structured.customTips : [structured.customTips].filter(Boolean);

          const personalizationNotes = {
            strengths,
            areasToWatch,
            learningStyle: structured.learningStyle || '',
            customTips,
          };

          // Actualizar notas en DB
          await admin
            .from('training_employees')
            .update({ personalization_notes: personalizationNotes })
            .eq('id', employeeId);
        }
      } catch (aiError) {
        console.error('[Hire API] AI personalization failed:', aiError);
      }
    }

    // 8. Construir URL de entrenamiento
    const trainingUrl = `${appUrl.replace(/\/$/, '')}/training/${invitationToken}`;

    // 9. Enviar correo de bienvenida vía Brevo (opcional/no-bloqueante)
    let emailSent = false;
    const BREVO_API_KEY = process.env.BREVO_API_KEY;

    if (BREVO_API_KEY) {
      try {
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f4f7fa;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);padding:40px 40px 30px;text-align:center;">
              <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;">Welcome to Your Training!</h1>
              <p style="color:#e0e7ff;margin:10px 0 0;font-size:16px;">Reclutify Training Center</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Hi <strong>${employee.name}</strong>,
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Congratulations on being selected for the role of <strong>${employee.role_title || ''}</strong>! We're excited to have you on board.
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">
                Your onboarding training program is ready. Click the button below to get started with your AI-guided learning experience.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${trainingUrl}" style="display:inline-block;background:linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%);color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:600;letter-spacing:0.5px;">
                      Start My Training
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#9ca3af;font-size:13px;line-height:1.5;margin:30px 0 0;text-align:center;">
                You can access your training at any time using the link above.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                Powered by Reclutify &mdash; AI-powered recruitment and training
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

        const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': BREVO_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'Reclutify Onboarding', email: 'onboarding@reclutify.com' },
            to: [{ email: employee.email, name: employee.name }],
            subject: `Welcome to Your Training - ${employee.role_title || 'Reclutify'}`,
            htmlContent: emailHtml,
          }),
        });

        if (brevoResponse.ok) {
          emailSent = true;
        } else {
          const errData = await brevoResponse.text();
          console.error('[Hire API] Brevo email delivery failed:', errData);
        }
      } catch (emailErr) {
        console.error('[Hire API] Error sending Brevo email:', emailErr);
      }
    }

    return NextResponse.json({
      success: true,
      employeeId,
      trainingUrl,
      emailSent,
    });
  } catch (err: unknown) {
    console.error('[Hire API] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
