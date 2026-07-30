import 'server-only';

import * as React from 'react';
import { Resend } from 'resend';

import { resolveAppBaseUrl } from '@/lib/app-url';
import { InterviewCompleteEmail } from '@/lib/email-templates/interview-complete';

/**
 * Aviso al reclutador de que una entrevista terminó.
 *
 * POR QUÉ ESTO ES UNA FUNCIÓN Y NO UNA RUTA
 * -----------------------------------------
 * `/api/evaluate` avisaba al reclutador así:
 *
 *     const origin = req.headers.get('origin')
 *       || process.env.NEXT_PUBLIC_APP_URL
 *       || 'http://localhost:3000';
 *     await fetch(`${origin}/api/notifications`, { method: 'POST', body: ... });
 *
 * Es decir: el servidor hacía una petición HTTP **a la URL que decidiera la
 * cabecera `Origin` de quien llamaba**. `Origin` la controla el cliente por
 * completo, así que con `Origin: https://atacante.example` el servidor enviaba
 * un `POST` con el nombre del candidato, su puntuación y la recomendación de
 * contratación a un servidor ajeno. Un SSRF que además exfiltra el resultado de
 * la evaluación.
 *
 * Y la cabecera no era necesaria para nada: el destino pretendido era la propia
 * aplicación. El propio repositorio ya tenía escrito por qué no se deben usar las
 * cabeceras de la petición para construir URLs — `src/lib/app-url.ts` existe
 * exactamente para eso y su comentario de cabecera lo razona— pero esta ruta no
 * lo usaba.
 *
 * La corrección no es «validar el origen»: es que **no hace falta ninguna
 * petición HTTP**. El manejador y el destinatario viven en el mismo proceso. Se
 * llama a la función directamente, con lo que desaparecen a la vez el SSRF, una
 * ida y vuelta de red, un salto de autenticación y el modo de fallo de que la
 * ruta interna estuviera caída.
 */

/** Datos del aviso. */
export interface RecruiterNotificationInput {
  /** Destinatario. Debe resolverlo el llamante desde la organización. */
  emailTo: string;
  candidateName: string;
  roleTitle: string;
  score: number | null;
  recommendation: string;
  /** Ruta relativa del informe dentro de la aplicación, p. ej. `/admin/pipeline`. */
  reportPath: string;
}

export type RecruiterNotificationResult =
  | { sent: true }
  | { sent: false; reason: 'not-configured' | 'no-recipient' | 'no-base-url' | 'send-failed' };

/**
 * Envía el aviso. **No lanza nunca.**
 *
 * El aviso es accesorio: la evaluación del candidato ya está calculada y guardada
 * cuando esto se ejecuta. Un fallo del correo no puede convertirse en un error de
 * la petición del candidato, que vería su entrevista fallar al final por un
 * problema de la bandeja del reclutador. Se devuelve el motivo para que el
 * llamante lo registre.
 */
export async function sendRecruiterInterviewNotification(
  input: RecruiterNotificationInput,
): Promise<RecruiterNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) return { sent: false, reason: 'not-configured' };
  if (!input.emailTo.trim()) return { sent: false, reason: 'no-recipient' };

  // La URL del informe se construye con la configuración del despliegue, nunca
  // con cabeceras de la petición. Ver el comentario de cabecera de este módulo.
  const baseUrl = resolveAppBaseUrl();
  if (!baseUrl) return { sent: false, reason: 'no-base-url' };

  const reportUrl = new URL(input.reportPath, baseUrl).toString();

  try {
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: 'Reclutify AI <onboarding@resend.dev>',
      to: [input.emailTo],
      subject: `✅ Nueva entrevista completada — ${input.candidateName} para ${input.roleTitle}`,
      react: InterviewCompleteEmail({
        candidateName: input.candidateName,
        roleTitle: input.roleTitle,
        score: input.score ?? 0,
        recommendation: input.recommendation,
        reportUrl,
      }) as React.ReactElement,
    });

    return { sent: true };
  } catch (error) {
    console.error('[recruiter-notification] send failed:', error);
    return { sent: false, reason: 'send-failed' };
  }
}

/**
 * Resuelve a quién avisar de las entrevistas de una organización.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * `/api/evaluate` avisaba a `'recruiter@reclutify.com'`, un literal incrustado en
 * el código. No es la dirección del cliente: es una dirección del proveedor. En
 * la práctica el aviso nunca llegaba al reclutador que había publicado la
 * vacante, así que la función anunciada («el equipo de evaluación recibe un
 * correo al terminar la entrevista») no ocurría para ningún cliente.
 *
 * CÓMO LO RESUELVE
 * ----------------
 * Busca al `owner` de la organización en `org_members` y, si no hay fila, en
 * `user_profiles` —las dos fuentes de pertenencia que el producto reconoce, por
 * el mismo motivo explicado en `src/lib/authz/org-role-authorization.ts`— y pide
 * su correo a la API de administración de Supabase Auth. El correo vive en
 * `auth.users`, que no es consultable con PostgREST.
 *
 * Devuelve `null` cuando no hay destinatario determinable. El llamante omite el
 * aviso: es preferible no enviar nada a enviar a una dirección inventada.
 */
export async function resolveOrgNotificationRecipient(orgId: string): Promise<string | null> {
  if (!orgId.trim()) return null;

  try {
    const { createAdminClient } = await import('@/utils/supabase/admin');
    const admin = createAdminClient();

    const { data: member } = await admin
      .from('org_members')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle();

    let ownerId = member?.user_id ?? null;

    if (!ownerId) {
      const { data: profile } = await admin
        .from('user_profiles')
        .select('user_id')
        .eq('org_id', orgId)
        .eq('role', 'owner')
        .limit(1)
        .maybeSingle();

      ownerId = profile?.user_id ?? null;
    }

    if (!ownerId) return null;

    const { data, error } = await admin.auth.admin.getUserById(ownerId);

    if (error) {
      console.error('[recruiter-notification] owner lookup failed:', error.message);
      return null;
    }

    return data.user?.email?.trim() || null;
  } catch (error) {
    console.error('[recruiter-notification] recipient resolution failed:', error);
    return null;
  }
}
