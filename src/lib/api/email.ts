import 'server-only';

import { resolveAppBaseUrl } from '@/lib/app-url';

import { ApiError } from './errors';

/**
 * Utilidades de los correos transaccionales.
 *
 * DOS PROBLEMAS DISTINTOS, DOS FUNCIONES
 * --------------------------------------
 * 1. `escapeHtml` — `/api/send-email` construye el cuerpo del correo con
 *    plantillas de cadena e interpola `candidateName` y `roleTitle` directamente
 *    en el HTML. Un nombre con `<` cerraba la etiqueta e inyectaba marcado en un
 *    correo firmado desde el dominio de la empresa. No es XSS en el navegador
 *    (los clientes de correo limitan el script) pero sí permite falsificar el
 *    contenido visible del mensaje: añadir un botón, cambiar el texto legal,
 *    insertar otro enlace.
 *
 * 2. `assertSelfHostedLink` — el mismo endpoint metía `link` en un `href`. Como
 *    no exigía sesión, cualquiera podía pedir el envío de un correo con la
 *    plantilla e imagen de marca de Reclutify, dirigido a la dirección que
 *    quisiera, con el botón «Comenzar Entrevista Ahora» apuntando a su propio
 *    sitio. Es phishing servido por la infraestructura y la reputación de
 *    remitente de la empresa.
 */

/**
 * Escapa los cinco caracteres que tienen significado en HTML.
 *
 * El orden importa: `&` va primero, porque si se sustituyera después
 * reescribiría las entidades que las demás reglas acaban de introducir
 * (`&lt;` pasaría a `&amp;lt;`).
 *
 * Se escapan también las comillas simples y dobles porque estos valores se
 * interpolan dentro de atributos, no solo en el texto de los nodos.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Exige que un enlace de correo apunte a la propia aplicación.
 *
 * POR QUÉ LA COMPROBACIÓN ES POR ORIGEN Y NO POR SUFIJO
 * ----------------------------------------------------
 * Un `endsWith('reclutify.com')` aceptaría `https://reclutify.com.atacante.net`
 * y `https://noreclutify.com`. Se compara el `origin` completo (esquema + host +
 * puerto) contra el origen configurado del despliegue, que es la única forma que
 * no admite un host parecido.
 *
 * La URL base sale de `resolveAppBaseUrl()` y NUNCA de las cabeceras de la
 * petición. El razonamiento está en `src/lib/app-url.ts`: derivarla de `Host` o
 * `Origin` permitiría que quien llama eligiera el destino del enlace, que es
 * exactamente el agujero que se está cerrando.
 *
 * @param rawLink Enlace tal como llegó en la petición.
 * @returns El enlace normalizado, seguro para insertar en un `href`.
 * @throws {ApiError} 400 si no parsea o no pertenece a la aplicación; 500 si el
 *   despliegue no tiene URL base configurada.
 */
export function assertSelfHostedLink(rawLink: string): string {
  const baseUrl = resolveAppBaseUrl();

  if (!baseUrl) {
    throw ApiError.misconfigured(
      'Public application URL is not configured. Set NEXT_PUBLIC_APP_URL to an absolute URL and redeploy.',
    );
  }

  let link: URL;
  let base: URL;

  try {
    link = new URL(rawLink);
    base = new URL(baseUrl);
  } catch {
    throw ApiError.badRequest('The interview link is not a valid absolute URL');
  }

  if (link.origin !== base.origin) {
    // El mensaje nombra el origen esperado, que no es secreto —está en cada URL
    // que sirve la aplicación— y sin él un 400 aquí es indepurable.
    throw ApiError.badRequest(
      `The interview link must point to ${base.origin}`,
    );
  }

  return link.toString();
}
