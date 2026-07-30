import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import { ApiError, API_ERROR_CODES } from './errors';

/**
 * Validación de URLs salientes que ELIGE el cliente.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * Dos rutas hacen una petición HTTP a una dirección que llega en el cuerpo:
 *
 *  - `/api/test-integration` — `config.url` del probador de webhooks.
 *  - `/api/webhooks/candidate-completed` — `webhookUrl` de la entrega.
 *
 * Ninguna de las dos exigía sesión ni validaba el destino, así que las dos eran
 * un SSRF completo: el servidor hacía la petición desde DENTRO de la red del
 * despliegue y devolvía al llamante el código de estado y el cuerpo del error.
 * Con eso se puede:
 *
 *  - Leer el servicio de metadatos de la plataforma (`169.254.169.254`), que en
 *    varios proveedores entrega credenciales temporales de la instancia.
 *  - Escanear la red interna usando el código de estado y el tiempo de respuesta
 *    como oráculo (`http://10.0.0.5:6379`, `http://localhost:5432`).
 *  - Alcanzar servicios internos que confían en el origen de la petición.
 *
 * QUÉ COMPRUEBA Y EN QUÉ ORDEN
 * ----------------------------
 *  1. La URL parsea y el esquema es `https` (o `http`, solo fuera de producción).
 *  2. El puerto es el estándar del esquema. Un puerto arbitrario no tiene uso
 *     legítimo en un webhook público y es la herramienta del escaneo interno.
 *  3. El nombre de host no es un literal IP de un rango no enrutable.
 *  4. Se RESUELVE el nombre y se comprueba que NINGUNA dirección devuelta cae en
 *     un rango no enrutable. Este paso es el que atrapa el truco habitual: un
 *     dominio público cuyo registro A apunta a `127.0.0.1`.
 *
 * LO QUE NO CUBRE, A PROPÓSITO
 * ----------------------------
 * Queda una ventana de «DNS rebinding»: entre la comprobación y el `fetch`, el
 * registro puede cambiar de dirección. Cerrarla del todo exige fijar la IP
 * validada al abrir el socket (un `Agent` con `lookup` propio), lo que obliga a
 * gestionar el pool de conexiones a mano y a perder el `fetch` nativo.
 *
 * Se acepta la ventana porque el resto de las medidas ya quita el valor al
 * ataque: las dos rutas ahora EXIGEN sesión de `owner`/`admin` (así que no es un
 * atacante anónimo), no devuelven el cuerpo de la respuesta del destino, y el
 * `fetch` corre con un tope de tiempo corto. La alternativa —un agente con IP
 * fijada— queda anotada como deuda técnica en `REPORTE_REFACTOR.md`.
 */

/**
 * Rangos IPv4 no enrutables en la Internet pública.
 *
 * Se comprueban por prefijo numérico y no con expresiones regulares sobre el
 * texto: `010.0.0.1`, `0x7f.1` y `2130706433` son formas válidas de escribir
 * direcciones privadas que una comprobación textual no ve. Al llegar aquí la
 * dirección ya pasó por `node:dns`, que las normaliza.
 */
const BLOCKED_IPV4_RANGES: { label: string; matches: (octets: number[]) => boolean }[] = [
  { label: 'this-network (0.0.0.0/8)', matches: ([a]) => a === 0 },
  { label: 'loopback (127.0.0.0/8)', matches: ([a]) => a === 127 },
  { label: 'private (10.0.0.0/8)', matches: ([a]) => a === 10 },
  { label: 'private (172.16.0.0/12)', matches: ([a, b]) => a === 172 && b >= 16 && b <= 31 },
  { label: 'private (192.168.0.0/16)', matches: ([a, b]) => a === 192 && b === 168 },
  // El servicio de metadatos de AWS, GCP, Azure y DigitalOcean vive en
  // 169.254.169.254. Se bloquea el /16 entero (link-local).
  { label: 'link-local (169.254.0.0/16)', matches: ([a, b]) => a === 169 && b === 254 },
  { label: 'CGNAT (100.64.0.0/10)', matches: ([a, b]) => a === 100 && b >= 64 && b <= 127 },
  { label: 'benchmarking (198.18.0.0/15)', matches: ([a, b]) => a === 198 && (b === 18 || b === 19) },
  { label: 'documentation (192.0.2.0/24)', matches: ([a, b, c]) => a === 192 && b === 0 && c === 2 },
  { label: 'multicast (224.0.0.0/4)', matches: ([a]) => a >= 224 && a <= 239 },
  { label: 'reserved (240.0.0.0/4)', matches: ([a]) => a >= 240 },
];

/** Comprueba si una dirección IPv4 en texto cae en un rango bloqueado. */
function blockedIpv4Reason(address: string): string | null {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return 'malformed IPv4 address';
  }

  return BLOCKED_IPV4_RANGES.find((range) => range.matches(octets))?.label ?? null;
}

/** Comprueba si una dirección IPv6 cae en un rango bloqueado. */
function blockedIpv6Reason(address: string): string | null {
  const normalized = address.toLowerCase();

  if (normalized === '::' || normalized === '::1') return 'loopback / unspecified (::1, ::)';
  // Unique local addresses fc00::/7 — el equivalente IPv6 de 10/8 y 192.168/16.
  if (/^f[cd]/.test(normalized)) return 'unique local address (fc00::/7)';
  // Link-local fe80::/10, que incluye el equivalente IPv6 de los metadatos.
  if (/^fe[89ab]/.test(normalized)) return 'link-local (fe80::/10)';

  // ─── Direcciones IPv4 mapeadas ───
  //
  // `::ffff:127.0.0.1` es loopback escrito en IPv6, y hay que comprobarlo en LAS
  // DOS notaciones porque `new URL()` normaliza la decimal a hexadecimal: el host
  // de `https://[::ffff:127.0.0.1]/` sale como `[::ffff:7f00:1]`.
  //
  // Solo mirar la forma decimal —que es lo que parece suficiente al escribir el
  // código— dejaba pasar precisamente la forma que produce el parseo de la URL, es
  // decir la única que llega aquí en la práctica. Lo detectó la prueba
  // `rechaza loopback en IPv6 y su forma mapeada de IPv4`.
  const mappedDecimal = normalized.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDecimal?.[1]) {
    const reason = blockedIpv4Reason(mappedDecimal[1]);
    return reason ? `IPv4-mapped ${reason}` : null;
  }

  const mappedHex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);

    const dotted = [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.');
    const reason = blockedIpv4Reason(dotted);

    return reason ? `IPv4-mapped ${reason}` : null;
  }

  return null;
}

/** Nombres que nunca deben alcanzarse, aunque el DNS los resuelva a público. */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

/** Puertos permitidos por esquema. */
const ALLOWED_PORTS: Record<string, Set<string>> = {
  'https:': new Set(['', '443']),
  'http:': new Set(['', '80']),
};

/** URL validada, lista para pasar a `fetch`. */
export interface SafeOutboundUrl {
  url: URL;
  /** Direcciones a las que resolvió el nombre. Para el log, no para el cliente. */
  resolvedAddresses: string[];
}

/**
 * Valida que una URL suministrada por el cliente puede alcanzarse sin exponer la
 * red interna del despliegue.
 *
 * @param rawUrl URL tal como llegó en la petición.
 * @param context Prefijo para los mensajes de log.
 * @returns La URL parseada y las direcciones a las que resolvió.
 * @throws {ApiError} 400 con un motivo genérico si el destino no es aceptable.
 *   El motivo detallado va al log: devolverlo convertiría el propio validador en
 *   el oráculo de red que trata de evitar.
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  context: string,
): Promise<SafeOutboundUrl> {
  const reject = (reason: string): never => {
    console.warn(`${context} blocked outbound URL: ${reason}`);
    throw new ApiError(
      400,
      'The destination URL is not allowed. Use a publicly reachable HTTPS endpoint.',
      API_ERROR_CODES.VALIDATION_FAILED,
      reason,
    );
  };

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return reject('unparseable URL');
  }

  const allowHttp = process.env.NODE_ENV !== 'production';

  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    return reject(`disallowed protocol ${url.protocol}`);
  }

  if (!ALLOWED_PORTS[url.protocol]?.has(url.port)) {
    return reject(`disallowed port ${url.port || '(default)'}`);
  }

  // `URL` deja los corchetes en un host IPv6 literal; se quitan para `isIP`.
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (hostname.length === 0) return reject('empty hostname');
  if (BLOCKED_HOSTNAMES.has(hostname)) return reject(`blocked hostname ${hostname}`);
  // `.local` es mDNS y `.internal` es la convención de redes privadas de varios
  // proveedores; ninguno de los dos es un destino público legítimo.
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return reject(`blocked hostname suffix on ${hostname}`);
  }

  const ipVersion = isIP(hostname);

  if (ipVersion === 4) {
    const reason = blockedIpv4Reason(hostname);
    if (reason) return reject(`literal IPv4 in ${reason}`);
    return { url, resolvedAddresses: [hostname] };
  }

  if (ipVersion === 6) {
    const reason = blockedIpv6Reason(hostname);
    if (reason) return reject(`literal IPv6 in ${reason}`);
    return { url, resolvedAddresses: [hostname] };
  }

  // Nombre de dominio: hay que resolverlo. Un dominio público que apunta a
  // 127.0.0.1 es el eludir más común de un validador que solo mira el texto.
  let records: { address: string; family: number }[];
  try {
    records = await lookup(hostname, { all: true });
  } catch (error) {
    console.warn(`${context} DNS lookup failed for ${hostname}:`, error);
    return reject(`DNS resolution failed for ${hostname}`);
  }

  if (records.length === 0) return reject(`no DNS records for ${hostname}`);

  for (const record of records) {
    const reason =
      record.family === 4 ? blockedIpv4Reason(record.address) : blockedIpv6Reason(record.address);

    // Basta UNA dirección no enrutable para rechazar: si el nombre resuelve a
    // varias, no se puede controlar a cuál abrirá el socket el `fetch`.
    if (reason) return reject(`${hostname} resolves to ${record.address} in ${reason}`);
  }

  return { url, resolvedAddresses: records.map((record) => record.address) };
}
