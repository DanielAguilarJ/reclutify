'use server';

import { requireOrgMembership } from '@/lib/api/auth';
import {
  REDACTED_PLACEHOLDER,
  isRedactedPlaceholder,
} from '@/lib/coach/integration-secrets';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Configuración del webhook de la organización, sin exponer el secreto de firma.
 *
 * POR QUÉ, SI YA NO SE ACEPTA DEL CUERPO
 * --------------------------------------
 * `/api/webhooks/candidate-completed` dejó de aceptar `webhookSecret` del cuerpo: ahora lo
 * lee de `webhook_configs`. Eso cerró el agujero grave —firmar una entrega con un secreto
 * elegido por quien llama— pero `webhookStore.fetchWebhookConfig` seguía trayéndose el
 * secreto al navegador con un `select('*')`.
 *
 * El riesgo residual es menor que el de las credenciales del asesor (1.18): este secreto es
 * NUESTRO, no de un tercero, y quien lo obtenga necesita además la URL del receptor, que ya
 * no viaja en ninguna petición del cliente. Pero es el mismo patrón, y el argumento para
 * corregirlo es el mismo: la interfaz solo necesita saber si hay un secreto configurado, no
 * cuál es.
 *
 * EL MARCADOR SE REUTILIZA
 * ------------------------
 * Se importa `REDACTED_PLACEHOLDER` de `src/lib/coach/integration-secrets.ts` en lugar de
 * declarar otro: dos marcadores distintos para el mismo concepto acabarían divergiendo, y el
 * de allí ya tiene sus pruebas.
 */

export interface WebhookConfigSummary {
  url: string;
  /** `'__SAVED__'` si hay secreto guardado, `''` si no. Nunca el valor real. */
  secret: string;
  /** Atajo para que la interfaz no tenga que comparar con el marcador. */
  hasSecret: boolean;
}

const EMPTY_SUMMARY: WebhookConfigSummary = { url: '', secret: '', hasSecret: false };

/**
 * Devuelve la configuración de webhook de la organización del usuario autenticado.
 *
 * No lanza: la pantalla de ajustes debe cargar aunque esta parte falle.
 */
export async function getWebhookConfig(): Promise<WebhookConfigSummary> {
  try {
    const { orgId } = await requireOrgMembership();

    const { data, error } = await createAdminClient()
      .from('webhook_configs')
      .select('webhook_url, webhook_secret')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('[webhook-config] read failed:', error.message);
      return EMPTY_SUMMARY;
    }

    const hasSecret = Boolean(data?.webhook_secret);

    return {
      url: data?.webhook_url ?? '',
      secret: hasSecret ? REDACTED_PLACEHOLDER : '',
      hasSecret,
    };
  } catch (error) {
    console.error('[webhook-config] read rejected:', error);
    return EMPTY_SUMMARY;
  }
}

/**
 * Guarda la configuración, conservando el secreto si el cliente devolvió el marcador.
 *
 * Sin esa comprobación, guardar la URL sin tocar el secreto lo sobrescribiría con la cadena
 * del marcador y todas las entregas siguientes irían firmadas con un valor que el receptor
 * rechazaría — el empleador dejaría de recibir avisos sin saber por qué.
 */
export async function saveWebhookConfig(input: {
  url: string;
  secret: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { orgId } = await requireOrgMembership();
    const admin = createAdminClient();

    let secretToStore = input.secret;

    if (isRedactedPlaceholder(input.secret)) {
      const { data, error } = await admin
        .from('webhook_configs')
        .select('webhook_secret')
        .eq('org_id', orgId)
        .maybeSingle();

      if (error) {
        console.error('[webhook-config] pre-save read failed:', error.message);
        return { success: false, error: 'No se pudo guardar la configuración' };
      }

      secretToStore = data?.webhook_secret ?? '';
    }

    const { error } = await admin.from('webhook_configs').upsert(
      {
        org_id: orgId,
        webhook_url: input.url,
        webhook_secret: secretToStore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id' },
    );

    if (error) {
      console.error('[webhook-config] save failed:', error.message);
      return { success: false, error: 'No se pudo guardar la configuración' };
    }

    return { success: true };
  } catch (error) {
    console.error('[webhook-config] save rejected:', error);
    return { success: false, error: 'No autorizado' };
  }
}
