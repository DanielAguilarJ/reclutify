import { NextRequest, NextResponse } from 'next/server';

import {
  INTERVIEW_TICKET_STATUS_CODES,
  interviewTicketRequestSchema,
} from '@/lib/interview-tickets/contracts';
import { resolveInterviewTicket } from '@/lib/interview-tickets/service';

export const runtime = 'nodejs';

/**
 * `POST /api/interview/ticket` — resuelve el token de un ticket de entrevista.
 *
 * Sustituye a las tres lecturas que `/interview/t/[token]` hacía desde el
 * navegador con la clave anon (`interview_tickets`, `roles` y `organizations`).
 * Con esta ruta en producción, la clave anon deja de necesitar `SELECT` sobre
 * `interview_tickets` y las políticas `public_ticket_by_token` y
 * `anon_tickets_update` se pueden retirar.
 *
 * NO REQUIERE SESIÓN, y no puede requerirla: el candidato no tiene cuenta. La
 * autorización es el token, y el alcance de lo que devuelve es la única
 * protección de datos, así que la proyección de columnas vive en
 * `@/lib/interview-tickets/service` y está cerrada.
 *
 * EL TOKEN VA EN EL CUERPO, NO EN LA URL. Es deliberado: en la ruta o en la
 * cadena de consulta acabaría en los logs de acceso del proxy, en el historial
 * del navegador y en la cabecera `Referer` de cualquier recurso externo que la
 * página cargue después. Por eso la operación es un `POST` aunque sea una
 * lectura, y por eso no existe un `GET` equivalente.
 *
 * Un cuerpo malformado responde `400` con estado `not_found`: el cuerpo de la
 * respuesta siempre es uno de los cuatro estados del contrato, de modo que el
 * cliente nunca tiene que interpretar formas distintas, y un token que no llega
 * a consultarse no se distingue de uno que no existe.
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

  const result = await resolveInterviewTicket(parsed.data.token);

  if (result.status !== 'valid') {
    return NextResponse.json(
      { status: result.status },
      { status: INTERVIEW_TICKET_STATUS_CODES[result.status] },
    );
  }

  return NextResponse.json(result);
}
