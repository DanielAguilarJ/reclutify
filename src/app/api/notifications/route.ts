import * as React from 'react';
import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { InterviewCompleteEmail } from '@/lib/email-templates/interview-complete';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emailTo, candidateName, roleTitle, score, recommendation, reportUrl } = body;

    if (!emailTo) {
      return NextResponse.json({ error: 'Missing recipient email' }, { status: 400 });
    }

    if (!resend) {
      console.warn('RESEND_API_KEY is not set. Simulation of email sending completed.');
      return NextResponse.json({ success: true, simulated: true, warning: 'RESEND_API_KEY missing' });
    }

    const data = await resend.emails.send({
      from: 'Reclutify AI <onboarding@resend.dev>',
      to: [emailTo],
      subject: `✅ Nueva entrevista completada — ${candidateName} para ${roleTitle}`,
      react: InterviewCompleteEmail({ candidateName, roleTitle, score, recommendation, reportUrl }) as React.ReactElement,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Failed to send email:', error);
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 });
  }
}
