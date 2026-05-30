import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const TOKEN_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateToken(length = 8): string {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += TOKEN_CHARSET[Math.floor(Math.random() * TOKEN_CHARSET.length)];
  }
  return token;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { candidateResultId, email, name, roleTitle, orgId, programId, interviewData } = body;

    if (!email || !name || !orgId || !programId) {
      return NextResponse.json(
        { error: 'Missing required fields: email, name, orgId, programId' },
        { status: 400 }
      );
    }

    const token = generateToken();
    const supabase = await createClient();

    // 1. Insert into training_employees
    const { data: employee, error: employeeError } = await supabase
      .from('training_employees')
      .insert({
        candidate_result_id: candidateResultId || null,
        email,
        name,
        role_title: roleTitle,
        org_id: orgId,
        program_id: programId,
        access_token: token,
        status: 'active',
        overall_progress: 0,
        interview_data: interviewData || null,
      })
      .select()
      .single();

    if (employeeError) {
      console.error('[hire-candidate] Employee insert error:', employeeError);
      return NextResponse.json(
        { error: 'Failed to create employee record' },
        { status: 500 }
      );
    }

    // 2. Fetch all modules for the program (ordered)
    const { data: modules, error: modulesError } = await supabase
      .from('training_modules')
      .select('id, title, order_index')
      .eq('program_id', programId)
      .order('order_index', { ascending: true });

    if (modulesError) {
      console.error('[hire-candidate] Modules fetch error:', modulesError);
      return NextResponse.json(
        { error: 'Failed to fetch program modules' },
        { status: 500 }
      );
    }

    // 3. Create training_progress entries (first = 'available', rest = 'locked')
    if (modules && modules.length > 0) {
      const progressEntries = modules.map((mod, index) => ({
        employee_id: employee.id,
        module_id: mod.id,
        status: index === 0 ? 'available' : 'locked',
        score: null,
        feedback: null,
      }));

      const { error: progressError } = await supabase
        .from('training_progress')
        .insert(progressEntries);

      if (progressError) {
        console.error('[hire-candidate] Progress insert error:', progressError);
      }
    }

    // 4. Generate personalization notes via AI
    let personalizationNotes = null;
    if (interviewData) {
      try {
        const aiPrompt = `Based on the following interview evaluation data for a new employee, generate personalization notes for their training program. The employee "${name}" was hired for the role "${roleTitle}".

INTERVIEW DATA:
${JSON.stringify(interviewData, null, 2)}

Return a JSON object with:
{
  "strengths": "A summary of their key strengths based on the interview (2-3 sentences)",
  "areasToWatch": "Areas where they may need extra support or attention during training (2-3 sentences)",
  "learningStyle": "Inferred learning style and preferences based on their responses (1-2 sentences)",
  "customTips": "Specific tips for trainers/AI tutor to personalize their learning experience (2-3 bullet points as a string)"
}

Respond ONLY with valid JSON, no markdown delimiters.`;

        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://reclutify.com',
            'X-Title': 'Reclutify Training Center',
          },
          body: JSON.stringify({
            model: 'x-ai/grok-4.20',
            messages: [{ role: 'user', content: aiPrompt }],
            temperature: 0.7,
            response_format: { type: 'json_object' },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || '{}';
          const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
          personalizationNotes = JSON.parse(jsonStr);

          // Update employee with personalization notes
          await supabase
            .from('training_employees')
            .update({ personalization_notes: personalizationNotes })
            .eq('id', employee.id);
        }
      } catch (aiError) {
        console.error('[hire-candidate] AI personalization error:', aiError);
        // Non-blocking: training can proceed without personalization
      }
    }

    // 5. Send welcome email via Brevo
    try {
      const trainingUrl = `https://reclutify.com/training/${token}`;

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
                Hi <strong>${name}</strong>,
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">
                Congratulations on being selected for the role of <strong>${roleTitle}</strong>! We're excited to have you on board.
              </p>
              <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 30px;">
                Your personalized onboarding training program is ready. Click the button below to get started with your AI-guided learning experience.
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
              <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:30px 0 0;text-align:center;">
                Your access code: <strong style="color:#6366f1;font-size:16px;letter-spacing:2px;">${token}</strong>
              </p>
              <p style="color:#9ca3af;font-size:13px;line-height:1.5;margin:20px 0 0;text-align:center;">
                You can also access your training at any time by visiting reclutify.com/training and entering your code.
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

      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY || '',
          'Content-Type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Reclutify', email: 'hola@reclutify.com' },
          to: [{ email, name }],
          subject: `${name}, your training program is ready!`,
          htmlContent: emailHtml,
        }),
      });
    } catch (emailError) {
      console.error('[hire-candidate] Email send error:', emailError);
      // Non-blocking: employee was created successfully
    }

    return NextResponse.json({
      success: true,
      employee: {
        ...employee,
        personalization_notes: personalizationNotes,
      },
      token,
      modulesCount: modules?.length || 0,
    });
  } catch (error) {
    const err = error as Error;
    console.error('[hire-candidate] failure:', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
