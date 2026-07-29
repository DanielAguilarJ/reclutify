import 'server-only';

import { classifySupabaseKeyShape } from '@/lib/supabase-key';

/**
 * Resolución de la clave de Supabase para las rutas que DEGRADAN en vez de fallar.
 *
 * POR QUÉ ES UN MÓDULO APARTE DE `supabase-key.ts`
 * ------------------------------------------------
 * `supabase-key.ts` responde una sola pregunta —«¿esto tiene la forma de una
 * clave de servicio?»— sin leer el entorno, sin registrar nada y sin lanzar,
 * para que sea importable desde cualquier sitio. Este archivo hace lo contrario:
 * lee `process.env`, escribe en el log del servidor y aplica una POLÍTICA
 * (caer a la clave `anon`). Son responsabilidades distintas y, sobre todo,
 * restricciones de importación distintas: aquí se lee un secreto de servidor, así
 * que el centinela `server-only` es obligatorio. Mezclarlas volvería
 * `supabase-key.ts` inutilizable fuera del grafo de servidor.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * Varias rutas construían su cliente con
 * `process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`.
 * Ese `||` solo cubre la ausencia. Con la variable PRESENTE pero con forma
 * equivocada —el nombre de la fila `service_role` en vez de su valor, o la clave
 * `anon` pegada en la variable del servicio— el respaldo no se activaba: se
 * construía un cliente inservible y cada operación moría con
 * `401 Invalid API key`. El diseño de esas rutas era degradar, no romperse, así
 * que la forma inválida debe comportarse como la ausencia.
 *
 * DIFERENCIA CON `createAdminClient()`
 * ------------------------------------
 * `createAdminClient()` LANZA ante una clave mal configurada, porque sus
 * llamantes necesitan saltarse RLS y no tienen plan B. Los llamantes de este
 * helper sí lo tienen: con la clave `anon` siguen funcionando las operaciones
 * que RLS permite, y lo que se pierde es accesorio (configuración con valores
 * por defecto, telemetría). Por eso aquí se advierte y se continúa.
 *
 * EL VALOR NUNCA SE REGISTRA
 * --------------------------
 * Las advertencias nombran la variable y el contexto, jamás el valor, ni
 * fragmentos, ni longitudes, ni prefijos. La aparición literal de `service_role`
 * en los mensajes se refiere a la fila del panel de Supabase, no al secreto.
 */

const SERVICE_ROLE_ENV = 'SUPABASE_SERVICE_ROLE_KEY';
const ANON_ENV = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

const FIX_HINT =
  `Open Supabase > Project Settings > API keys and copy the VALUE of the service_role row into ${SERVICE_ROLE_ENV}, then redeploy.`;

/**
 * Lee una variable y devuelve su valor recortado, o `null` si no hay contenido.
 *
 * El recorte importa: un salto de línea arrastrado en el copiado convertiría una
 * clave por lo demás correcta en una cabecera HTTP inválida.
 */
function readEnvKey(name: string): string | null {
  const value = process.env[name];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Devuelve la clave que debe usar una ruta que puede degradar:
 * la de servicio si su forma es válida, la `anon` en cualquier otro caso, y
 * `null` cuando tampoco hay clave `anon` (el llamante entonces se salta el
 * trabajo, como hacía antes con la comprobación `if (!supabaseKey)`).
 *
 * `context` identifica el punto de uso en el log (p. ej.
 * `'info-chat/loadAIConfig'`); no debe contener datos de la petición.
 *
 * Solo se advierte cuando la variable de servicio ESTÁ definida con una forma
 * inválida, que es el fallo silencioso que este helper existe para delatar. La
 * ausencia lisa y llana no se registra: es la configuración degradada esperada
 * (un entorno local sin secreto de servicio, por ejemplo) y ya la reporta
 * `GET /api/training/diagnostics`.
 */
export function resolveSupabaseServerKey(context: string): string | null {
  const serviceRoleKey = readEnvKey(SERVICE_ROLE_ENV);
  const shape = classifySupabaseKeyShape(serviceRoleKey);

  if (shape === 'service-role') {
    return serviceRoleKey;
  }

  if (shape === 'anon') {
    console.warn(
      `[supabase-key] ${context}: ${SERVICE_ROLE_ENV} holds the project anon (publishable) key, which cannot bypass RLS. Falling back to ${ANON_ENV}; anything that needs to bypass RLS will fail. ${FIX_HINT}`,
    );
  } else if (shape === 'unrecognized') {
    console.warn(
      `[supabase-key] ${context}: ${SERVICE_ROLE_ENV} is set but does not have the shape of a service role key — most likely the row name or a placeholder instead of the secret. Falling back to ${ANON_ENV}; anything that needs to bypass RLS will fail. ${FIX_HINT}`,
    );
  }

  return readEnvKey(ANON_ENV);
}
