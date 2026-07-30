import { NextResponse } from 'next/server';

import { inviteCandidatesRequestSchema } from '@/lib/invites/contracts';
import { createCandidateInvites } from '@/lib/invites/service';
import {
  PUBLIC_FLOW_AUTH_LOG_PREFIX,
  authorizeInviteForRole,
  requireInviteSession,
} from '@/lib/invites/session-authorization';

/**
 * API: crear invitaciones de entrevista para una vacante.
 *
 * La ruta es una envoltura: autoriza, valida el cuerpo y delega en
 * `createCandidateInvites` (`src/lib/invites/service.ts`), que es el mismo
 * módulo que usa `applyToJob`. Toda la lógica de escritura vive allí; aquí solo
 * quedan las decisiones que dependen de la petición HTTP.
 *
 * ORDEN DE LAS COMPROBACIONES
 * ---------------------------
 * 1. Sesión de Supabase. Va primero, antes incluso de leer el cuerpo: un
 *    rechazo garantiza cero escrituras, cero consultas a las tablas del
 *    producto y ningún trabajo de análisis del payload de quien no está
 *    autenticado.
 * 2. JSON válido.
 * 3. Esquema Zod, con tope en el número de destinatarios.
 * 4. Pertenencia a la organización dueña del `roleId`, con rol suficiente para
 *    invitar. Necesita el `roleId`, así que es la única que va después de
 *    validar el cuerpo — y sigue estando antes de cualquier escritura.
 *
 * Ninguna comprobación depende de una cabecera, así que ninguna se puede saltar
 * omitiéndola: ese fue el fallo original. El detalle de cada decisión está en
 * `src/lib/invites/session-authorization.ts`.
 */

/**
 * Registra un rechazo con un prefijo estable y sin datos sensibles: nunca el
 * nombre ni el correo de un candidato, nunca el contenido del cuerpo.
 */
function logRejection(
  req: Request,
  reason: string,
  details: Record<string, unknown> = {},
) {
  console.warn(
    `${PUBLIC_FLOW_AUTH_LOG_PREFIX} invite-candidates POST rejected: ${reason}`,
    {
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      referer: req.headers.get('referer') || null,
      ...details,
    },
  );
}

export async function POST(req: Request) {
  try {
    const session = await requireInviteSession();

    if (!session.ok) {
      logRejection(req, session.reason);
      return NextResponse.json(
        { error: session.message },
        { status: session.status },
      );
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = inviteCandidatesRequestSchema.safeParse(raw);
    if (!parsed.success) {
      // Se devuelven las RUTAS de los campos inválidos, nunca sus valores:
      // sirven para depurar el cliente sin reflejar datos de candidatos.
      const invalidFields = [
        ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
      ];

      return NextResponse.json(
        { error: 'Invalid request body', invalidFields },
        { status: 400 },
      );
    }

    const authorization = await authorizeInviteForRole(
      session.userId,
      parsed.data.roleId,
    );

    if (!authorization.ok) {
      logRejection(req, authorization.reason, {
        userId: session.userId,
        roleId: parsed.data.roleId,
        recipients: parsed.data.candidates.length,
      });

      return NextResponse.json(
        { error: authorization.message },
        { status: authorization.status },
      );
    }

    const results = await createCandidateInvites(parsed.data);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    // La causa técnica se queda en el log del servidor: el mensaje de una
    // excepción puede llevar detalle de configuración o de la base de datos.
    console.error('[api/invite-candidates][POST] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
