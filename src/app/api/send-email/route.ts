import { NextResponse, type NextRequest } from 'next/server';

import { requireOrgMembership } from '@/lib/api/auth';
import { assertSelfHostedLink, escapeHtml } from '@/lib/api/email';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { sendEmailRequestSchema } from '@/lib/schemas/api';

/**
 * POST /api/send-email — invitación a entrevista por correo.
 *
 * QUÉ ESTABA MAL
 * --------------
 * La ruta no exigía NADA. Aceptaba `{ email, candidateName, roleTitle, link }`
 * de quien fuera y llamaba a la API de Brevo con la clave de la empresa. En la
 * práctica era **un relé de correo abierto sobre el dominio de Reclutify**:
 *
 *  - El remitente era `hola@reclutify.com`, con la plantilla y la marca reales.
 *  - `link` iba directo a `href="${link}"`, así que el botón «Comenzar Entrevista
 *    Ahora» podía apuntar a cualquier sitio.
 *  - `candidateName` y `roleTitle` se interpolaban en el HTML sin escapar, así
 *    que el cuerpo visible del mensaje era manipulable.
 *  - Sin tope de tasa, se podía enviar en bucle.
 *
 * El daño no se limita a los destinatarios engañados: una campaña de phishing
 * saliendo de la cuenta de Brevo de la empresa quema la reputación del dominio y
 * manda a la carpeta de spam los correos legítimos de invitación, que son el
 * canal principal del producto.
 *
 * CÓMO SE CIERRA
 * --------------
 *  1. **Sesión de organización obligatoria.** Los dos únicos llamantes reales
 *     —`/admin/tickets` y el envío masivo de `/admin/create-role`— ya son
 *     pantallas autenticadas de empleador, así que exigirlo no quita
 *     funcionalidad.
 *  2. **El enlace tiene que ser de la propia aplicación** (`assertSelfHostedLink`).
 *     El destinatario NO se restringe a candidatos ya existentes a propósito: el
 *     caso de uso es invitar a alguien que aún no está en la base. Lo que hace
 *     legítimo el envío es que hay un reclutador autenticado detrás,
 *     identificable en el log.
 *  3. **Todo lo interpolado se escapa** (`escapeHtml`).
 *  4. **Tope de tasa** de 20 correos por hora y organización.
 */

export const runtime = 'nodejs';

/** Copia del correo en los dos idiomas que soporta el producto. */
function buildCopy(language: 'en' | 'es', roleTitle: string, candidateName: string) {
  const isEs = language !== 'en';

  return {
    isEs,
    lang: isEs ? 'es' : 'en',
    subject: isEs
      ? `Tu Entrevista para ${roleTitle || 'la vacante'} en Reclutify`
      : `Your Interview for ${roleTitle || 'the position'} at Reclutify`,
    title: isEs ? `¡Hola ${candidateName}!` : `Hello ${candidateName}!`,
    intro: isEs
      ? `Nos alegra informarte que has sido seleccionado(a) para avanzar en el proceso de selección para la vacante de <strong>${roleTitle || 'la posición'}</strong>.`
      : `We are pleased to inform you that you have been selected to advance in the hiring process for the <strong>${roleTitle || 'position'}</strong>.`,
    instructionsTitle: isEs
      ? '¿Cómo funciona la entrevista con Reclutify?'
      : 'How does the Reclutify interview work?',
    step1: isEs
      ? '<strong>1. Haz clic en el botón:</strong> Serás dirigido a nuestra plataforma segura.'
      : '<strong>1. Click the button:</strong> You will be redirected to our secure platform.',
    step2: isEs
      ? '<strong>2. Brinda permisos:</strong> Tu navegador te pedirá acceso a tu cámara y micrófono para interactuar con la IA de forma natural.'
      : '<strong>2. Grant permissions:</strong> Your browser will request access to your camera and microphone to interact naturally with the AI.',
    step3: isEs
      ? '<strong>3. Conversa con la IA:</strong> Responderás preguntas pregrabadas de nuestra IA, similar a una videollamada real. Toma tu tiempo y sé tú mismo(a).'
      : '<strong>3. Talk to the AI:</strong> You will answer questions from our AI, similar to a real video call. Take your time and be yourself.',
    buttonText: isEs ? 'Comenzar Entrevista Ahora' : 'Start Interview Now',
    videoText: isEs
      ? '¿Tienes dudas sobre cómo unirte? <a href="https://www.youtube.com/watch?v=k21ac2OAjHM" target="_blank" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Mira nuestro video tutorial aquí</a>.'
      : 'Have questions about how to join? <a href="https://www.youtube.com/watch?v=k21ac2OAjHM" target="_blank" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Watch our video tutorial here</a>.',
    footerText: isEs
      ? 'Este enlace es personal, intransferible y expirará en 24 horas.'
      : 'This link is personal, non-transferable, and will expire in 24 hours.',
    closing: isEs ? '¡Mucho éxito!' : 'Best of luck!',
    team: isEs ? 'El equipo de Reclutify' : 'The Reclutify Team',
  };
}

/**
 * Cuerpo HTML del correo.
 *
 * Los valores que vienen de la petición llegan YA escapados: el escape se hace
 * en el llamante, junto a la validación, para que no exista un camino que
 * construya el HTML con datos sin pasar por ahí.
 */
function buildEmailHtml(copy: ReturnType<typeof buildCopy>, safeLink: string): string {
  return `
      <!DOCTYPE html>
      <html lang="${copy.lang}">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #1f2937;
              background-color: #f9fafb;
              margin: 0;
              padding: 40px 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              padding: 40px;
              border: 1px solid #f3f4f6;
              border-radius: 16px;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
            }
            .header { text-align: center; margin-bottom: 30px; }
            .logo {
              color: #4f46e5;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.5px;
              margin: 0;
            }
            h2 { color: #111827; font-size: 20px; margin-top: 0; }
            p { font-size: 16px; color: #4b5563; margin-bottom: 24px; }
            .guide-box {
              background-color: #eef2ff;
              border-left: 4px solid #4f46e5;
              padding: 24px;
              border-radius: 0 12px 12px 0;
              margin: 32px 0;
            }
            .guide-title {
              color: #4f46e5;
              font-weight: 700;
              font-size: 18px;
              margin-top: 0;
              margin-bottom: 16px;
            }
            .guide-list { list-style-type: none; padding: 0; margin: 0; }
            .guide-item {
              margin-bottom: 12px;
              font-size: 15px;
              color: #374151;
              position: relative;
              padding-left: 20px;
            }
            .guide-item::before {
              content: "•";
              color: #4f46e5;
              font-weight: bold;
              position: absolute;
              left: 0;
            }
            .button-wrapper { text-align: center; margin: 40px 0; }
            .button {
              display: inline-block;
              padding: 14px 28px;
              background-color: #4f46e5;
              color: #ffffff !important;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              font-size: 16px;
            }
            .footer {
              margin-top: 40px;
              padding-top: 24px;
              border-top: 1px solid #f3f4f6;
              font-size: 13px;
              color: #9ca3af;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="logo">Reclutify</h1>
            </div>
            <h2>${copy.title}</h2>
            <p>${copy.intro}</p>

            <div class="guide-box">
              <p class="guide-title">${copy.instructionsTitle}</p>
              <ul class="guide-list">
                <li class="guide-item">${copy.step1}</li>
                <li class="guide-item">${copy.step2}</li>
                <li class="guide-item">${copy.step3}</li>
              </ul>
            </div>

            <div class="button-wrapper">
              <a href="${safeLink}" class="button">${copy.buttonText}</a>
            </div>

            <p style="text-align: center; font-size: 15px; margin-top: -10px; margin-bottom: 40px; color: #4b5563;">
              ${copy.videoText}
            </p>

            <p>
              ${copy.closing}<br/>
              <strong>${copy.team}</strong>
            </p>

            <div class="footer">
              <p>${copy.footerText}</p>
            </div>
          </div>
        </body>
      </html>
    `;
}

export async function POST(req: NextRequest) {
  try {
    // La identidad se establece ANTES de leer el cuerpo: una petición anónima se
    // va con 401 sin que se haya evaluado nada ni consumido cuota de Brevo.
    const { user, orgId } = await requireOrgMembership();

    await enforceRateLimit(req, RATE_LIMITS.EMAIL_SEND, orgId);

    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = sendEmailRequestSchema.parse(rawBody);

    const safeLink = escapeHtml(assertSelfHostedLink(body.link));
    const copy = buildCopy(body.language, escapeHtml(body.roleTitle), escapeHtml(body.candidateName));

    const apiKey = process.env.BREVO_API_KEY?.trim();
    if (!apiKey) {
      throw ApiError.misconfigured('Email delivery is not configured. Set BREVO_API_KEY.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Reclutify', email: 'hola@reclutify.com' },
        to: [{ name: body.candidateName, email: body.email }],
        subject: copy.subject,
        htmlContent: buildEmailHtml(copy, safeLink),
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      // El cuerpo del error de Brevo va al log y NO al cliente: puede incluir
      // detalles de la cuenta y de la clave.
      throw ApiError.upstream('Failed to send the invitation email', {
        status: response.status,
        body: await response.text().catch(() => '(unreadable)'),
      });
    }

    // Deja rastro de quién envió qué: el endpoint manda correo con la marca de la
    // empresa, así que el envío tiene que ser atribuible.
    console.info(`[send-email] invitation sent by user=${user.id} org=${orgId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '[send-email]');
  }
}
