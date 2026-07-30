import { NextResponse } from 'next/server';

import {
  PUBLIC_FLOW_AUTH_LOG_PREFIX,
  authorizeInviteRequest,
} from '@/lib/invites/authorization';
import { inviteCandidatesRequestSchema } from '@/lib/invites/contracts';
import { createCandidateInvites } from '@/lib/invites/service';

/**
 * API: crear invitaciones de entrevista para una vacante.
 *
 * La ruta es una envoltura: autentica, valida el cuerpo y delega en
 * `createCandidateInvites` (`src/lib/invites/service.ts`), que es el mismo
 * módulo que usa `applyToJob`. Toda la lógica de escritura vive allí; aquí solo
 * quedan las decisiones que dependen de la petición HTTP.
 *
 * ORDEN DE LAS COMPROBACIONES
 * ---------------------------
 * 1. Autenticación por `x-api-key` contra `MAKE_WEBHOOK_SECRET`. Va primero,
 *    antes incluso de leer el cuerpo: un rechazo garantiza cero escrituras y no
 *    gasta trabajo en analizar el payload de quien no está autorizado.
 * 2. JSON válido.
 * 3. Esquema Zod, con tope en el número de destinatarios.
 *
 * Ningún camino acepta la petición "por omisión": el detalle de por qué está en
 * `src/lib/invites/authorization.ts`.
 */
export async function POST(req: Request) {
  const auth = authorizeInviteRequest(
    req.headers.get('x-api-key'),
    process.env.MAKE_WEBHOOK_SECRET,
  );

  if (!auth.ok) {
    // El log no incluye el valor de la cabecera ni el secreto configurado: solo
    // el motivo y el contexto de la llamada, para poder distinguir una
    // integración mal configurada de un sondeo.
    console.warn(
      `${PUBLIC_FLOW_AUTH_LOG_PREFIX} invite-candidates POST rejected: ${auth.reason}`,
      {
        hasApiKeyHeader: req.headers.get('x-api-key') !== null,
        ip: req.headers.get('x-forwarded-for') || null,
        userAgent: req.headers.get('user-agent') || null,
        referer: req.headers.get('referer') || null,
      },
    );

    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = inviteCandidatesRequestSchema.safeParse(raw);
  if (!parsed.success) {
    // Se devuelven las RUTAS de los campos inválidos, nunca sus valores: sirven
    // para depurar la integración sin reflejar datos de candidatos.
    const invalidFields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
    ];

    return NextResponse.json(
      { error: 'Invalid request body', invalidFields },
      { status: 400 },
    );
  }

  try {
    const results = await createCandidateInvites(parsed.data);
    return NextResponse.json({ success: true, results });
  } catch (err) {
    // La causa técnica se queda en el log del servidor: el mensaje de una
    // excepción puede llevar detalle de configuración o de la base de datos.
    console.error('[api/invite-candidates][POST] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
