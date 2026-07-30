import { NextRequest, NextResponse } from 'next/server';

import {
  INFO_SESSION_REJECTED_STATUS_CODES,
  infoSessionStateRequestSchema,
} from '@/lib/info-sessions/contracts';
import { readInfoSessionState } from '@/lib/info-sessions/service';

export const runtime = 'nodejs';

/**
 * `POST /api/info-sessions/state` — estado de la sesión que acredita la credencial.
 *
 * Sustituye al canal de tiempo real de `infoSessionStore`, que se suscribía a los
 * `UPDATE` de `info_sessions` filtrando por `id` para detectar
 * `status = 'completed'` y avisar al cliente de que el asesor le atendió. Ese
 * canal no funciona sin la política `anon_read_own_session`: el filtro por `id`
 * acota lo que llega al navegador, pero la entrega del evento exige `SELECT` para
 * `anon` sobre la tabla, y con `USING (true)` eso es lectura pública de TODAS las
 * sesiones —nombre, correo, teléfono y transcripción de cada cliente—. Retirada
 * esa política, la pantalla pregunta por esta ruta.
 *
 * ES UNA LECTURA QUE EXIGE CREDENCIAL. Sin ella devolvería el estado de la sesión
 * de cualquiera, así que pide el mismo par `{ sessionId, accessToken }` que la
 * escritura y viaja en el cuerpo de un `POST` para que la credencial no acabe en
 * los logs de acceso ni en la cabecera `Referer`.
 *
 * Solo salen `status` y `coach_notified`. Ni transcripción, ni datos de contacto,
 * ni `conversion_result`: es lo único que la pantalla del cliente consulta.
 */
export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ status: 'unauthorized' }, { status: 400 });
  }

  const parsed = infoSessionStateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 400 });
  }

  const result = await readInfoSessionState(parsed.data);

  if (result.status === 'error') {
    // El fallo de lectura no se disfraza de rechazo de credencial: el sondeo
    // vuelve a preguntar a los pocos segundos y el `500` queda en los logs.
    return NextResponse.json({ status: 'unauthorized' }, { status: 500 });
  }

  if (result.status !== 'ok') {
    return NextResponse.json(
      { status: result.status },
      { status: INFO_SESSION_REJECTED_STATUS_CODES[result.status] },
    );
  }

  return NextResponse.json(result);
}
