import { NextRequest, NextResponse } from 'next/server';

import {
  INFO_SESSION_REJECTED_STATUS_CODES,
  infoSessionUpdateRequestSchema,
} from '@/lib/info-sessions/contracts';
import { updateInfoSession } from '@/lib/info-sessions/service';

export const runtime = 'nodejs';

/**
 * `POST /api/info-sessions/sync` — escritura parcial sobre la sesión del cliente.
 *
 * Sustituye a los dos `UPDATE` que el navegador hacía con la clave anon:
 * `infoSessionStore.syncTranscript` (transcripción y objeciones detectadas) y
 * `updateSessionStatus` (estado, modo de cierre, correo y teléfono). Los dos se
 * apoyaban en la política `anon_update_own_session` (`USING (true)`), que no
 * acotaba por sesión sino por rol: cualquiera podía reescribir la sesión de otra
 * persona.
 *
 * LA CREDENCIAL ES OBLIGATORIA Y EL `sessionId` NO BASTA. El identificador viaja
 * al cuerpo de `/api/info-chat`, al de `/api/info-notify` y a cualquier log de
 * esos caminos: es un nombre, no un secreto. Por eso el esquema exige el par
 * `{ sessionId, accessToken }` y `updateInfoSession` localiza la fila por los dos
 * a la vez.
 *
 * LA LISTA BLANCA DE COLUMNAS ES EL ESQUEMA, no un `if` de esta ruta:
 * `infoSessionPatchSchema` es `strictObject`, así que `conversion_result`,
 * `coach_notified`, `org_id`, `course_id` o un `status` fuera de los tres del
 * cliente no tienen camino hasta la base aunque alguien los envíe.
 *
 * Un cuerpo ilegible responde `400` con estado `unauthorized`: la respuesta
 * siempre es uno de los dos estados del contrato de escritura, y el código de
 * estado es el que separa el cuerpo malformado (`400`), la credencial que no
 * corresponde (`403`) y el fallo del servidor (`500`).
 */
export async function POST(req: NextRequest) {
  let rawBody: unknown;

  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ status: 'unauthorized' }, { status: 400 });
  }

  const parsed = infoSessionUpdateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 400 });
  }

  const result = await updateInfoSession(parsed.data);

  if (result.status === 'error') {
    // El fallo de escritura no se disfraza de rechazo de credencial: el cliente
    // reintenta en la siguiente sincronización y el `500` queda en los logs.
    return NextResponse.json({ status: 'unauthorized' }, { status: 500 });
  }

  if (result.status !== 'updated') {
    return NextResponse.json(
      { status: result.status },
      { status: INFO_SESSION_REJECTED_STATUS_CODES[result.status] },
    );
  }

  return NextResponse.json(result);
}
