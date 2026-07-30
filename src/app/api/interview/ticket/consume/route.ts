import { NextRequest, NextResponse } from 'next/server';

import {
  INTERVIEW_TICKET_STATUS_CODES,
  interviewTicketRequestSchema,
} from '@/lib/interview-tickets/contracts';
import { consumeInterviewTicket } from '@/lib/interview-tickets/service';

export const runtime = 'nodejs';

/**
 * `POST /api/interview/ticket/consume` — quema el ticket de entrevista.
 *
 * Sustituye a `ticketStore.syncMarkUsed`, que hacía
 * `UPDATE interview_tickets SET used = true WHERE token = ...` desde el
 * navegador con la clave anon. Esa escritura exigía la política
 * `anon_tickets_update` (`UPDATE TO anon USING (true)`), que además de servir al
 * flujo legítimo permitía a cualquiera marcar como usados los tickets ajenos y
 * dejar a esos candidatos fuera de su entrevista.
 *
 * CUÁNDO SE LLAMA: en el mismo momento que antes, cuando el candidato entra de
 * verdad a la sala (`phase === 'interview'`), no al validar el enlace. Así
 * quien cierra el navegador en el formulario o en la comprobación de hardware
 * puede volver a abrir el mismo enlace.
 *
 * El consumo es una transición de disponible a usado, no un "asegúrate de que
 * está usado": un ticket ya usado o expirado se rechaza SIN escribir.
 *
 * El token viaja en el cuerpo por la misma razón que en la ruta de resolución:
 * es una credencial y no debe quedar en logs de acceso ni en el `Referer`.
 */
export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ status: 'not_found' }, { status: 400 });
  }

  const parsed = interviewTicketRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ status: 'not_found' }, { status: 400 });
  }

  const result = await consumeInterviewTicket(parsed.data.token);

  if (result.status === 'error') {
    // El fallo de escritura no se disfraza de rechazo del ticket: el candidato
    // sigue en la entrevista y el servidor deja constancia del 500.
    return NextResponse.json({ status: 'not_found' }, { status: 500 });
  }

  if (result.status !== 'consumed') {
    return NextResponse.json(
      { status: result.status },
      { status: INTERVIEW_TICKET_STATUS_CODES[result.status] },
    );
  }

  return NextResponse.json({ status: 'consumed' });
}
