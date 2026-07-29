/**
 * Resolución de la URL base pública de la aplicación.
 *
 * POR QUÉ NO SE USAN LOS HEADERS DE LA PETICIÓN
 * ---------------------------------------------
 * Sería trivial derivar la URL base de `Host`, `X-Forwarded-Host` u `Origin`
 * de la petición entrante, y eso eliminaría toda configuración. Está
 * descartado a propósito.
 *
 * El primer consumidor de este módulo construye el enlace de capacitación del
 * empleado recién contratado, y ese enlace lleva embebido un token opaco de un
 * solo uso que otorga acceso a la sesión de capacitación. Esos headers los
 * controla quien hace la petición: un `Host: atacante.example` falsificado
 * produciría un enlace apuntando al atacante, y el correo de bienvenida se lo
 * entregaría al empleado firmado por nosotros. El token se exfiltra en cuanto
 * el empleado abre el enlace.
 *
 * Por eso la URL base solo puede venir de configuración del despliegue, que el
 * cliente no puede influir: variables de entorno explícitas, las variables que
 * inyecta la plataforma, y un fallback a localhost únicamente fuera de
 * producción.
 */

/** Únicos esquemas aceptables para una URL base pública. */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Valida que el candidato sea una URL absoluta http/https y la devuelve
 * normalizada sin barra final. Cualquier otra cosa (cadena vacía, ruta
 * relativa, valor basura, esquema no web) devuelve `null` para que el llamante
 * pase a la siguiente fuente en vez de propagar una URL inservible.
 *
 * Se conserva la ruta del valor original en lugar de reducirlo a su origen:
 * un despliegue bajo subruta (`https://example.com/app`) es configuración
 * legítima.
 */
function normalizeBaseUrl(candidate: string | undefined): string | null {
  const trimmed = candidate?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  if (!parsed.hostname) return null;

  return trimmed.replace(/\/+$/, '');
}

/**
 * Las variables de Vercel llegan como host desnudo (`mi-app.vercel.app`), sin
 * esquema. Se les prefija `https://`; si alguna vez llegaran ya con esquema, se
 * respeta el valor tal cual en vez de duplicarlo.
 */
function withHttpsScheme(host: string | undefined): string | undefined {
  const trimmed = host?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Devuelve la URL base pública de la aplicación, sin barra final, o `null` si
 * no hay ninguna fuente utilizable.
 *
 * Precedencia:
 *
 * 1. `NEXT_PUBLIC_APP_URL` — configuración explícita del operador; gana siempre
 *    que sea una URL absoluta http/https válida.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — dominio estable de producción del
 *    proyecto. Va antes que `VERCEL_URL` porque esta última cambia en cada
 *    despliegue y un enlace de capacitación vive 30 días.
 * 3. `VERCEL_URL` — host del despliegue actual; sirve para vistas previa.
 * 4. `http://localhost:${PORT}` — solo fuera de producción, para desarrollo y
 *    pruebas. En producción se prefiere fallar de forma visible antes que
 *    enviar un enlace a localhost.
 */
export function resolveAppBaseUrl(): string | null {
  const explicit = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit;

  const productionHost = normalizeBaseUrl(
    withHttpsScheme(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  );
  if (productionHost) return productionHost;

  const deploymentHost = normalizeBaseUrl(withHttpsScheme(process.env.VERCEL_URL));
  if (deploymentHost) return deploymentHost;

  if (process.env.NODE_ENV !== 'production') {
    return normalizeBaseUrl(`http://localhost:${process.env.PORT || 3000}`);
  }

  return null;
}

/**
 * Igual que `resolveAppBaseUrl`, pero lanza cuando no hay URL base. Para
 * llamantes que no pueden continuar sin ella y prefieren delegar la respuesta
 * de error en su manejador de excepciones.
 */
export function requireAppBaseUrl(): string {
  const baseUrl = resolveAppBaseUrl();

  if (!baseUrl) {
    throw new Error(
      'Public application URL could not be resolved. Set NEXT_PUBLIC_APP_URL to an absolute URL (for example https://app.reclutify.com) in the deployment environment variables and redeploy.',
    );
  }

  return baseUrl;
}
