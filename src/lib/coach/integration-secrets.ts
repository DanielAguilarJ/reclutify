import 'server-only';

/**
 * Redacción de los secretos de integraciones antes de que salgan del servidor.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * `coach_settings.integrations` es un JSONB que guarda credenciales de TERCEROS:
 *
 *  - `google_sheets.credentials` — el JSON completo de una cuenta de servicio de Google,
 *    con su clave privada PEM.
 *  - `hubspot.api_key` — el Private App Token del CRM del cliente.
 *  - `notion.token` — el token de integración de su espacio de trabajo.
 *  - `webhook.secret` — el secreto con el que se firman los avisos salientes.
 *
 * `coachSettingsStore.fetchSettings` los leía con `select('*')` desde el NAVEGADOR. Eso
 * pone las cuatro credenciales en la respuesta HTTP, en el montón de JavaScript y en la
 * pestaña de red de las herramientas de desarrollo.
 *
 * Con RLS correcto solo las ve la propia organización, así que no es una fuga entre
 * clientes. Pero sigue siendo un problema:
 *
 *  1. Son credenciales de sistemas de TERCEROS. Una extensión del navegador, un script de
 *     analítica mal configurado o un XSS las captura, y el daño ocurre en el CRM del
 *     cliente, no en el nuestro.
 *  2. La tabla `coach_settings` NO TIENE MIGRACIÓN en este repositorio (ver la sección 6
 *     de `REPORTE_REFACTOR.md`), así que no se puede AFIRMAR que su RLS sea correcta. Un
 *     control que no se puede verificar no es un control.
 *  3. La interfaz no las necesita. Solo necesita saber si la integración está
 *     configurada, para decidir si muestra «Conectado» o el formulario vacío.
 *
 * EL PATRÓN: ESCRITURA SIN LECTURA
 * --------------------------------
 * El asesor escribe la credencial una vez y no vuelve a verla, igual que una contraseña.
 * Al servidor sube el valor nuevo; del servidor baja únicamente `configured: true`. Si se
 * equivocó, la reescribe.
 */

/** Campos de cada integración que contienen un secreto. */
const SECRET_FIELDS: Record<string, readonly string[]> = {
  webhook: ['secret'],
  google_sheets: ['credentials'],
  hubspot: ['api_key'],
  notion: ['token'],
};

/**
 * Marcador que sustituye a un secreto presente.
 *
 * Se usa un valor reconocible en lugar de la cadena vacía para que la interfaz pueda
 * distinguir «hay una credencial guardada» de «no hay ninguna» y pintar «Conectado» en
 * vez de un formulario que parece vacío. Y para que un guardado accidental de este valor
 * se pueda detectar en el servidor: ver `isRedactedPlaceholder`.
 */
export const REDACTED_PLACEHOLDER = '__SAVED__';

/** ¿Este valor es el marcador y no una credencial real? */
export function isRedactedPlaceholder(value: unknown): boolean {
  return value === REDACTED_PLACEHOLDER;
}

/**
 * Sustituye los secretos por el marcador, conservando el resto de la configuración.
 *
 * Construye objetos NUEVOS en lugar de borrar claves del original: así un campo secreto
 * que se añada en el futuro a una integración queda dentro del recorrido por
 * construcción, y no depende de que alguien se acuerde de añadirlo a una lista de
 * exclusión.
 */
export function redactIntegrationSecrets(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};

  const source = raw as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [integrationKey, integrationValue] of Object.entries(source)) {
    if (!integrationValue || typeof integrationValue !== 'object') {
      result[integrationKey] = integrationValue;
      continue;
    }

    const fields = { ...(integrationValue as Record<string, unknown>) };
    const secretFields = SECRET_FIELDS[integrationKey] ?? [];

    for (const field of secretFields) {
      // Solo se marca lo que EXISTE y tiene contenido. Un campo vacío se deja vacío para
      // que la interfaz muestre el formulario en blanco en vez de «Conectado».
      const value = fields[field];
      fields[field] = typeof value === 'string' && value.length > 0 ? REDACTED_PLACEHOLDER : '';
    }

    result[integrationKey] = fields;
  }

  return result;
}

/**
 * Combina la configuración entrante con la guardada, conservando los secretos que el
 * cliente no cambió.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * Como la interfaz recibe el marcador en lugar del secreto, al guardar volvería a subir
 * el marcador. Sin esta combinación, el guardado sobrescribiría la credencial real con la
 * cadena `'__SAVED__'` y la integración dejaría de funcionar: el usuario habría destruido
 * su propia configuración por pulsar «Guardar» sin tocar nada.
 *
 * La regla: un campo secreto que llega con el marcador CONSERVA el valor almacenado;
 * cualquier otro valor lo sustituye.
 */
export function mergeIntegrationSecrets(
  incoming: unknown,
  stored: unknown,
): Record<string, unknown> {
  if (!incoming || typeof incoming !== 'object') return {};

  const incomingRecord = incoming as Record<string, unknown>;
  const storedRecord =
    stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {};

  const result: Record<string, unknown> = {};

  for (const [integrationKey, integrationValue] of Object.entries(incomingRecord)) {
    if (!integrationValue || typeof integrationValue !== 'object') {
      result[integrationKey] = integrationValue;
      continue;
    }

    const fields = { ...(integrationValue as Record<string, unknown>) };
    const storedIntegration = storedRecord[integrationKey];
    const storedFields =
      storedIntegration && typeof storedIntegration === 'object'
        ? (storedIntegration as Record<string, unknown>)
        : {};

    for (const field of SECRET_FIELDS[integrationKey] ?? []) {
      if (isRedactedPlaceholder(fields[field])) {
        // El cliente no lo cambió: se conserva lo que hay en la base.
        fields[field] = storedFields[field] ?? '';
      }
    }

    result[integrationKey] = fields;
  }

  return result;
}
