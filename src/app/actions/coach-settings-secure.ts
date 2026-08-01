'use server';

import { requireOrgAccess } from '@/lib/api/auth';
import {
  mergeIntegrationSecrets,
  redactIntegrationSecrets,
} from '@/lib/coach/integration-secrets';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Lectura y escritura de la configuración del asesor, con los secretos de terceros
 * redactados.
 *
 * POR QUÉ ESTAS DOS ACCIONES EXISTEN
 * ----------------------------------
 * `coachSettingsStore` leía `coach_settings` con `select('*')` desde el navegador, lo que
 * enviaba al cliente las credenciales de Google, HubSpot, Notion y el secreto del webhook.
 * El razonamiento completo está en `src/lib/coach/integration-secrets.ts`.
 *
 * Estas acciones son el camino que lo sustituye: la lectura pasa por la redacción y la
 * escritura recompone los secretos que el cliente no cambió.
 *
 * LA AUTORIZACIÓN NO SE RELAJA POR USAR LA CLAVE DE SERVICIO
 * ---------------------------------------------------------
 * `requireOrgAccess(orgId)` comprueba que la cuenta autenticada administre ESA
 * organización antes de tocar nada, así que un `orgId` ajeno se rechaza con `403` en vez
 * de usarse. La clave de servicio solo evita depender de que las políticas RLS de una
 * tabla sin migración estén desplegadas.
 */

export interface CoachSettingsResult {
  success: boolean;
  error?: string;
  /** Fila de `coach_settings` con los secretos sustituidos por un marcador. */
  data?: Record<string, unknown>;
}

/**
 * Devuelve la configuración de la organización, sin secretos.
 *
 * Los campos de credenciales llegan como `'__SAVED__'` si hay algo guardado, o vacíos si
 * no. La interfaz usa eso para decidir entre «Conectado» y un formulario en blanco.
 */
export async function getCoachSettings(orgId: string): Promise<CoachSettingsResult> {
  try {
    await requireOrgAccess(orgId);

    const admin = createAdminClient();

    const { data, error } = await admin
      .from('coach_settings')
      .select('*')
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) {
      console.error('[coach-settings] read failed:', error.message);
      return { success: false, error: 'No se pudo cargar la configuración' };
    }

    // Sin fila todavía: el store aplica sus valores por defecto. Se devuelve éxito con
    // `data` ausente en lugar de un error, porque una organización recién creada no tiene
    // configuración y eso no es un fallo.
    if (!data) return { success: true };

    return {
      success: true,
      data: { ...data, integrations: redactIntegrationSecrets(data.integrations) },
    };
  } catch (error) {
    // `requireOrgAccess` lanza `ApiError` con su status; aquí solo interesa no filtrar el
    // detalle al cliente.
    console.error('[coach-settings] read rejected:', error);
    return { success: false, error: 'No autorizado' };
  }
}

/**
 * Guarda la configuración, conservando los secretos que el cliente no cambió.
 *
 * Un campo de credencial que llega con el marcador mantiene el valor almacenado. Sin esa
 * combinación, pulsar «Guardar» sin tocar nada sobrescribiría la credencial real con la
 * cadena del marcador y el usuario habría destruido su propia integración.
 */
export async function saveCoachSettings(
  orgId: string,
  payload: Record<string, unknown>,
): Promise<CoachSettingsResult> {
  try {
    await requireOrgAccess(orgId);

    const admin = createAdminClient();

    // Se leen los secretos actuales para poder recomponerlos. Es una consulta más, y es
    // el precio de no enviarlos nunca al navegador.
    const { data: current, error: readError } = await admin
      .from('coach_settings')
      .select('integrations')
      .eq('org_id', orgId)
      .maybeSingle();

    if (readError) {
      console.error('[coach-settings] pre-save read failed:', readError.message);
      return { success: false, error: 'No se pudo guardar la configuración' };
    }

    const nextPayload = { ...payload };

    if ('integrations' in nextPayload) {
      nextPayload.integrations = mergeIntegrationSecrets(
        nextPayload.integrations,
        current?.integrations ?? {},
      );
    }

    const { error } = await admin
      .from('coach_settings')
      .upsert({ org_id: orgId, ...nextPayload }, { onConflict: 'org_id' });

    if (error) {
      console.error('[coach-settings] save failed:', error.message);
      return { success: false, error: 'No se pudo guardar la configuración' };
    }

    return { success: true };
  } catch (error) {
    console.error('[coach-settings] save rejected:', error);
    return { success: false, error: 'No autorizado' };
  }
}
