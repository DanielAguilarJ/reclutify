import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, candidateName, roleTitle, link, language } = body;

    if (!email || !candidateName || !link) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const isEs = language !== 'en';

    const subject = isEs
      ? `Tu Entrevista para ${roleTitle || 'la vacante'} en Reclutify`
      : `Your Interview for ${roleTitle || 'the position'} at Reclutify`;

    const title = isEs ? `¡Hola ${candidateName}!` : `Hello ${candidateName}!`;
    
    const intro = isEs 
      ? `Nos alegra informarte que has sido seleccionado(a) para avanzar en el proceso de selección para la vacante de <strong>${roleTitle || 'la posición'}</strong>.` 
      : `We are pleased to inform you that you have been selected to advance in the hiring process for the <strong>${roleTitle || 'position'}</strong>.`;

    const instructionsTitle = isEs ? '¿Cómo funciona la entrevista con Reclutify?' : 'How does the Reclutify interview work?';
    
    const step1 = isEs ? '<strong>1. Haz clic en el botón:</strong> Serás dirigido a nuestra plataforma segura.' : '<strong>1. Click the button:</strong> You will be redirected to our secure platform.';
    const step2 = isEs ? '<strong>2. Brinda permisos:</strong> Tu navegador te pedirá acceso a tu cámara y micrófono para interactuar con la IA de forma natural.' : '<strong>2. Grant permissions:</strong> Your browser will request access to your camera and microphone to interact naturally with the AI.';
    const step3 = isEs ? '<strong>3. Conversa con la IA:</strong> Responderás preguntas pregrabadas de nuestra IA, similar a una videollamada real. Toma tu tiempo y sé tú mismo(a).' : '<strong>3. Talk to the AI:</strong> You will answer questions from our AI, similar to a real video call. Take your time and be yourself.';

    const buttonText = isEs ? 'Comenzar Entrevista Ahora' : 'Start Interview Now';
    
    const videoText = isEs 
      ? '¿Tienes dudas sobre cómo unirte? <a href="https://www.youtube.com/watch?v=k21ac2OAjHM" target="_blank" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Mira nuestro video tutorial aquí</a>.' 
      : 'Have questions about how to join? <a href="https://www.youtube.com/watch?v=k21ac2OAjHM" target="_blank" style="color: #4f46e5; text-decoration: underline; font-weight: 600;">Watch our video tutorial here</a>.';

    const footerText = isEs
      ? 'Este enlace es personal, intransferible y expirará en 24 horas.'
      : 'This link is personal, non-transferable, and will expire in 24 hours.';

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="${isEs ? 'es' : 'en'}">
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
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
            }
            .logo {
              color: #4f46e5;
              font-size: 28px;
              font-weight: 800;
              letter-spacing: -0.5px;
              margin: 0;
            }
            h2 {
              color: #111827;
              font-size: 20px;
              margin-top: 0;
            }
            p {
              font-size: 16px;
              color: #4b5563;
              margin-bottom: 24px;
            }
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
            .guide-list {
              list-style-type: none;
              padding: 0;
              margin: 0;
            }
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
            .button-wrapper {
              text-align: center;
              margin: 40px 0;
            }
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
            <h2>${title}</h2>
            <p>${intro}</p>
            
            <div class="guide-box">
              <p class="guide-title">${instructionsTitle}</p>
              <ul class="guide-list">
                <li class="guide-item">${step1}</li>
                <li class="guide-item">${step2}</li>
                <li class="guide-item">${step3}</li>
              </ul>
            </div>

            <div class="button-wrapper">
              <a href="${link}" class="button">${buttonText}</a>
            </div>

            <p style="text-align: center; font-size: 15px; margin-top: -10px; margin-bottom: 40px; color: #4b5563;">
              ${videoText}
            </p>

            <p>
              ${isEs ? '¡Mucho éxito!' : 'Best of luck!'}<br/>
              <strong>${isEs ? 'El equipo de Reclutify' : 'The Reclutify Team'}</strong>
            </p>

            <div class="footer">
              <p>${footerText}</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const payload = {
      sender: {
        name: 'Reclutify',
        email: 'hola@reclutify.com',
      },
      to: [
        {
          name: candidateName,
          email: email,
        },
      ],
      subject: subject,
      htmlContent: htmlContent,
    };

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
        'accept': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Brevo error:', errorData);
      return NextResponse.json(
        { error: 'Failed to send email' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Email error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
