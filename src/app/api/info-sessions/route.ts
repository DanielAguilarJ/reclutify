import { NextRequest, NextResponse } from 'next/server';

import {
  INFO_SESSION_REJECTED_STATUS_CODES,
  infoSessionCreateRequestSchema,
} from '@/lib/info-sessions/contracts';
import { createInfoSession } from '@/lib/info-sessions/service';

export const runtime = 'nodejs';

/**
 * `POST /api/info-sessions` — crea la sesión de informes y emite su credencial.
 *
 * Sustituye al `INSERT` que `infoSessionStore.createSession` hacía desde el
 * navegador con la clave anon. Esa escritura exigía la política
 * `anon_insert_sessions` (`WITH CHECK (true)`), que al ser pública permitía a
 * cualquiera crear sesiones en cualquier organización.
 *
 * NO REQUIERE SESIÓN, y no puede requerirla: el cliente que pide informes de un
 * curso no tiene cuenta. La autorización que sí aplica es que el `org_id` NO se
 * acepta del cuerpo —se deriva del `courseId` dentro de `createInfoSession`—, así
 * que nadie puede colgar su sesión del panel de una organización ajena.
 *
 * La respuesta lleva el `accessToken` en claro UNA sola vez. Es la credencial de
 * toda escritura posterior, y en la base solo queda su hash.
 *
 * Un cuerpo ilegible o que no cumpla el esquema responde `400` con estado
 * `course_not_found`: el cuerpo de la respuesta es siempre uno de los estados del
 * contrato, de modo que el cliente no tiene que interpretar formas distintas. El
 * código de estado es el que distingue "no hay curso" de "no me entendiste".
 */
export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ status: 'course_not_found' }, { status: 400 });
  }

  const parsed = infoSessionCreateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ status: 'course_not_found' }, { status: 400 });
  }

  const result = await createInfoSession(parsed.data);

  if (result.status === 'error') {
    // El fallo de la base de datos no se disfraza de curso inexistente: el
    // cuerpo mantiene la forma del contrato y el `500` dice la verdad. Afirmar
    // `404` haría que el cliente descartara un curso que sí existe.
    return NextResponse.json({ status: 'course_not_found' }, { status: 500 });
  }

  if (result.status !== 'created') {
    return NextResponse.json(
      { status: result.status },
      { status: INFO_SESSION_REJECTED_STATUS_CODES[result.status] },
    );
  }

  return NextResponse.json(result);
}
