import {
  interviewTicketConsumeResponseSchema,
  interviewTicketResponseSchema,
  type InterviewTicketConsumeStatus,
  type InterviewTicketResponse,
} from './contracts';

/**
 * Cliente de navegador de las rutas del ticket de entrevista.
 *
 * La página del candidato ya no habla con Supabase: pide a estas dos funciones
 * lo que antes leía y escribía con la clave anon. La respuesta se valida con el
 * mismo esquema que usa el servidor para construirla, así que la página trabaja
 * con datos tipados sin `any` y sin confiar en la forma del JSON recibido.
 */

export const INTERVIEW_TICKET_RESOLVE_PATH = '/api/interview/ticket';
export const INTERVIEW_TICKET_CONSUME_PATH = '/api/interview/ticket/consume';

/** Cabeceras y opciones comunes: el token nunca debe quedar en una caché. */
function requestInit(token: string): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
    cache: 'no-store',
  };
}

/**
 * Resuelve el token del enlace de entrevista.
 *
 * Cualquier fallo de red, cuerpo ilegible o respuesta que no cumpla el contrato
 * se traduce a `not_found`, que es la pantalla de "Ticket Inválido" que la
 * página mostraba antes ante cualquier fallo de resolución. Nunca lanza: la
 * pantalla tiene que poder pintar un estado siempre.
 */
export async function fetchInterviewTicket(token: string): Promise<InterviewTicketResponse> {
  try {
    const response = await fetch(INTERVIEW_TICKET_RESOLVE_PATH, requestInit(token));
    const parsed = interviewTicketResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : { status: 'not_found' };
  } catch {
    return { status: 'not_found' };
  }
}

/**
 * Marca el ticket como usado al entrar a la sala.
 *
 * La página no cambia de comportamiento según el resultado —igual que antes, en
 * que los errores de `syncMarkUsed` se registraban y se descartaban—, pero el
 * estado se devuelve para poder registrarlo y para las pruebas.
 */
export async function consumeInterviewTicket(
  token: string,
): Promise<InterviewTicketConsumeStatus | 'error'> {
  try {
    const response = await fetch(INTERVIEW_TICKET_CONSUME_PATH, requestInit(token));
    const parsed = interviewTicketConsumeResponseSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.status : 'error';
  } catch {
    return 'error';
  }
}
