import { NextResponse, type NextRequest } from 'next/server';

import { ApiError, handleApiError } from '@/lib/api/errors';
import { requireInterviewOrOrgAccess } from '@/lib/api/interview-access';
import { assertSafeOutboundUrl } from '@/lib/api/outbound-url';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { webhookDispatchRequestSchema } from '@/lib/schemas/api';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * POST /api/webhooks/candidate-completed — entrega el aviso «entrevista
 * completada» al webhook que configuró el empleador.
 *
 * QUÉ ESTABA MAL
 * --------------
 * La ruta aceptaba `webhookUrl` y `webhookSecret` DEL CUERPO, sin sesión:
 *
 *     const { webhookUrl, webhookSecret, ... } = await req.json();
 *     if (!webhookUrl) return 400;
 *     const response = await fetch(webhookUrl, { method: 'POST', headers, body });
 *     return NextResponse.json({ success: response.ok, statusCode: response.status, statusText: response.statusText });
 *
 * Tres problemas encadenados:
 *
 *  1. **SSRF anónimo con oráculo.** Cualquiera hacía que el servidor conectara a
 *     donde quisiera desde dentro de la red del despliegue, y recibía de vuelta
 *     `statusCode` y `statusText`. Suficiente para leer el servicio de metadatos
 *     de la plataforma y enumerar puertos internos.
 *
 *  2. **Firma con secreto elegido por el atacante.** Como el `webhookSecret`
 *     también venía del cuerpo, el atacante podía enviar a un webhook REAL de un
 *     cliente una carga firmada con un secreto propio... o, peor, si conocía el
 *     secreto del cliente, enviarle un `interview.completed` inventado con la
 *     puntuación y la recomendación que quisiera. El receptor lo habría validado
 *     como auténtico: la firma es correcta y el origen es nuestro servidor.
 *
 *  3. **`status: 200` en el `catch`.** El manejador devolvía 200 incluso al
 *     fallar, con el comentario «el fallo es en la entrega, no en nuestra API».
 *     El resultado es que el panel registraba entregas fallidas como si la
 *     petición hubiera ido bien.
 *
 * CÓMO SE CIERRA
 * --------------
 *  1. **Credencial de entrevista obligatoria** (`roleId` + ticket/enlace/sesión).
 *  2. **El destino y el secreto se leen de `webhook_configs`** para la
 *     organización que la credencial acredita. El cliente ya no elige a dónde
 *     conecta el servidor ni con qué firma: solo dispara la entrega de lo que el
 *     empleador guardó en su panel.
 *  3. **`assertSafeOutboundUrl`** sobre la URL almacenada. Se valida aunque venga
 *     de la base: el empleador la escribió a mano en un formulario, así que sigue
 *     siendo entrada de usuario, solo que autenticada.
 *  4. **`redirect: 'manual'`**, para que un `302` no eluda la validación.
 *  5. **Tope de tasa** por organización.
 */

export const runtime = 'nodejs';

/** Tope de tiempo de la entrega. */
const DELIVERY_TIMEOUT_MS = 10_000;

/** Configuración de webhook de una organización. */
interface WebhookConfig {
  url: string;
  secret: string;
}

/**
 * Lee la configuración de webhook de la organización.
 *
 * Con la clave de servicio: la decisión ya está autorizada por la credencial, y
 * depender de RLS aquí haría que el flujo del candidato (que no tiene sesión)
 * nunca pudiera leer la configuración de la organización.
 */
async function loadWebhookConfig(orgId: string): Promise<WebhookConfig | null> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('webhook_configs')
    .select('webhook_url, webhook_secret')
    .eq('org_id', orgId)
    .maybeSingle();

  if (error) {
    throw ApiError.misconfigured('Could not load the webhook configuration', error);
  }

  const url = data?.webhook_url?.trim() ?? '';

  if (!url) return null;

  return { url, secret: data?.webhook_secret?.trim() ?? '' };
}

/** Firma HMAC-SHA256 en hexadecimal, como esperan los receptores existentes. */
async function signPayload(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = webhookDispatchRequestSchema.parse(rawBody);

    // Modo dual: con `roleId` se comprueba la entrevista concreta; sin él —el
    // botón de prueba del panel— se exige sesión de organización.
    const access = await requireInterviewOrOrgAccess(rawBody, body.roleId ?? null);

    await enforceRateLimit(req, RATE_LIMITS.WEBHOOK_DISPATCH, access.orgId);

    const config = await loadWebhookConfig(access.orgId);

    if (!config) {
      // No es un error: la organización simplemente no tiene webhook configurado.
      // El cliente ya comprueba `webhookUrl` antes de llamar, así que esto solo
      // ocurre en una carrera con el borrado de la configuración.
      return NextResponse.json({ success: false, skipped: true, reason: 'not_configured' });
    }

    const { url } = await assertSafeOutboundUrl(config.url, '[webhooks/candidate-completed]');

    const payload = JSON.stringify({
      event: 'interview.completed',
      data: {
        candidateId: body.candidateId,
        // Cuando la autorización fue por credencial de entrevista, se usa el
        // `roleId` que ELLA acredita y no el del cuerpo, para que la carga
        // entregada no pueda declarar una vacante distinta. En el camino de
        // prueba del panel no hay vacante acreditada y se pasa lo que envió.
        roleId: access.roleId || body.roleId,
        candidateName: body.candidateName,
        overallScore: body.overallScore,
        recommendation: body.recommendation,
        topicScores: body.topicScores,
        completedAt: body.completedAt || new Date().toISOString(),
        isTest: body.isTest,
      },
      timestamp: new Date().toISOString(),
      source: 'reclutify',
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Reclutify-Webhook/1.0',
    };

    if (config.secret) {
      headers['X-Signature-256'] = `sha256=${await signPayload(config.secret, payload)}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        redirect: 'manual',
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      return NextResponse.json({
        success: response.ok,
        statusCode: response.status,
      });
    } catch (deliveryError) {
      // El fallo de entrega SÍ se reporta como fallo, pero con 200: el panel
      // guarda un registro por intento y necesita leer el cuerpo. Lo que cambia
      // respecto a la versión anterior es que ya no se filtra el mensaje de la
      // excepción, que contenía el host y el puerto del destino.
      console.warn('[webhooks/candidate-completed] delivery failed:', deliveryError);

      return NextResponse.json({
        success: false,
        statusCode: 0,
        error: 'Delivery failed',
      });
    }
  } catch (error) {
    return handleApiError(error, '[webhooks/candidate-completed]');
  }
}
