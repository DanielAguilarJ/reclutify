import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { requireOrgMembership } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { sendRecruiterInterviewNotification } from '@/lib/api/recruiter-notification';

/**
 * POST /api/notifications — aviso manual al reclutador de una entrevista completada.
 *
 * QUÉ ESTABA MAL
 * --------------
 * La ruta no exigía nada y llamaba a Resend con la clave de la empresa usando el
 * `emailTo` que llegara en el cuerpo. Era el **segundo relé de correo abierto**
 * del proyecto, junto a `/api/send-email`: cualquiera podía hacer que la
 * infraestructura de Reclutify enviara un correo con su marca a la dirección que
 * eligiera, y con el nombre de candidato, la puntuación y la recomendación que
 * quisiera inventarse.
 *
 * QUÉ CAMBIA, ADEMÁS DE EXIGIR SESIÓN
 * -----------------------------------
 * El ÚNICO llamante que existía era `/api/evaluate`, que se conectaba a esta
 * misma ruta por HTTP usando la cabecera `Origin` para construir la URL — un
 * SSRF. Ese camino ya no pasa por aquí: `/api/evaluate` llama directamente a
 * `sendRecruiterInterviewNotification`, en el mismo proceso.
 *
 * La ruta se conserva, en vez de borrarse, porque el `CHANGELOG.md` la documenta
 * como parte de la superficie de la API y borrarla rompería a cualquier
 * integración que la use. Lo que ya no hace es aceptar peticiones anónimas.
 *
 * El destinatario tampoco se acepta del cuerpo: se usa el correo de la cuenta
 * autenticada. Aceptar `emailTo` convertiría el endpoint en un relé hacia
 * terceros incluso con sesión —bastaría una cuenta gratuita— y el caso de uso no
 * lo necesita: quien pide el aviso es el reclutador que lo va a recibir.
 */

export const runtime = 'nodejs';

const notificationRequestSchema = z.looseObject({
  candidateName: z.string().trim().max(300).catch(''),
  roleTitle: z.string().trim().max(300).catch(''),
  score: z.number().min(0).max(100).nullish().catch(null),
  recommendation: z.string().trim().max(100).catch(''),
  /**
   * Ruta RELATIVA del informe. Ya no se acepta una URL absoluta: la base la pone
   * el servidor con `resolveAppBaseUrl`, así que el cuerpo no puede dirigir el
   * enlace del correo a un dominio ajeno.
   */
  reportPath: z.string().trim().max(500).startsWith('/').catch('/admin/pipeline'),
});

export async function POST(request: NextRequest) {
  try {
    const { user, orgId } = await requireOrgMembership();

    await enforceRateLimit(request, RATE_LIMITS.EMAIL_SEND, orgId);

    const rawBody: unknown = await request.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = notificationRequestSchema.parse(rawBody);

    // El destinatario es la cuenta autenticada y solo ella. `user.email` lo pone
    // Supabase a partir del JWT validado, así que no es influenciable por el
    // cuerpo de la petición.
    const emailTo = user.email?.trim();

    if (!emailTo) {
      throw ApiError.badRequest('Your account has no email address to notify');
    }

    const result = await sendRecruiterInterviewNotification({
      emailTo,
      candidateName: body.candidateName,
      roleTitle: body.roleTitle,
      score: body.score ?? null,
      recommendation: body.recommendation,
      reportPath: body.reportPath,
    });

    if (!result.sent) {
      // `not-configured` no es un error del cliente: el despliegue no tiene clave
      // de Resend. Se responde 200 con la marca de simulación, que es lo que la
      // versión anterior ya hacía, para no romper a quien lo interprete así.
      if (result.reason === 'not-configured') {
        console.warn('[notifications] RESEND_API_KEY missing; notification skipped');
        return NextResponse.json({ success: true, simulated: true, warning: 'RESEND_API_KEY missing' });
      }

      throw ApiError.upstream('Failed to send the notification email', result.reason);
    }

    console.info(`[notifications] sent by user=${user.id} org=${orgId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, '[notifications]');
  }
}
