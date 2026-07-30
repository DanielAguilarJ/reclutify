/**
 * Generación del token de acceso a la entrevista (`interview_tickets.token`).
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * El token es la ÚNICA credencial que abre `/interview/t/[token]`: quien lo
 * tiene entra a la entrevista como el candidato al que se le emitió. Las dos
 * implementaciones anteriores —una en `src/app/api/invite-candidates/route.ts`
 * y otra en `src/store/ticketStore.ts`— lo derivaban de `Math.random()`, que
 * no es un generador criptográfico: su estado interno se puede reconstruir a
 * partir de unas pocas salidas observadas, así que ver un token propio permite
 * predecir los de otros candidatos emitidos por el mismo proceso.
 *
 * Aquí se genera con `crypto.getRandomValues`, el CSPRNG de la plataforma. El
 * módulo es isomorfo a propósito (Web Crypto, no `node:crypto`) porque lo usan
 * tanto la ruta de servidor como el store del panel, que corre en el navegador.
 *
 * SOBRE EL FORMATO Y LA COMPATIBILIDAD
 * ------------------------------------
 * Antes de cambiar el formato se comprobó qué valida el token en el repo:
 *
 *  - `supabase/migrations/00003_sync_data_persistence.sql:26-40`: la columna es
 *    `token TEXT UNIQUE NOT NULL` con un índice; no hay `CHECK` de longitud ni
 *    de alfabeto. Ninguna otra migración toca `interview_tickets`.
 *  - `src/lib/interview-tickets/service.ts`: `resolveInterviewTicket` y
 *    `consumeInterviewTicket` filtran con `.eq('token', token)`. Igualdad
 *    exacta, sin validación de forma. (Antes esas dos consultas las hacía
 *    `src/store/ticketStore.ts` desde el navegador con la clave anon.)
 *  - `src/app/interview/t/[token]/page.tsx`: pasa el segmento dinámico tal cual
 *    a esas rutas; no mide longitud ni valida caracteres. El único límite es el
 *    tope de longitud del esquema de la petición
 *    (`MAX_INTERVIEW_TICKET_TOKEN_LENGTH`, 128), holgado para los tokens de 8
 *    caracteres ya emitidos.
 *  - `src/app/admin/tickets/page.tsx` y `src/app/admin/create-role/page.tsx`:
 *    solo muestran el token y lo pegan en la URL del enlace.
 *
 * Es decir: nada valida la forma, así que los tokens de 8 caracteres ya
 * emitidos siguen resolviendo con normalidad y no hace falta migrar ninguna
 * fila. Lo que sí cambia es la longitud de los NUEVOS: 8 caracteres sobre un
 * alfabeto de 32 son 40 bits de entropía, poco para una credencial portadora
 * que viaja por correo y vive 24 horas. Con 16 caracteres son 80 bits, y el
 * alfabeto se conserva idéntico para que el token siga siendo legible y
 * copiable a mano (sin `I`, `O`, `0` ni `1`).
 */

/**
 * Alfabeto del token: 32 símbolos, sin los caracteres visualmente ambiguos
 * (`I`, `O`, `0`, `1`). Es el mismo que usaban los dos generadores anteriores.
 */
export const INVITE_TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Longitud del token en caracteres. 16 × log2(32) = 80 bits de entropía. */
export const INVITE_TOKEN_LENGTH = 16;

/**
 * Máscara de los 5 bits bajos de cada byte aleatorio.
 *
 * El alfabeto tiene exactamente 32 símbolos, una potencia de dos que divide a
 * 256, así que quedarse con los 5 bits bajos de un byte uniforme produce un
 * índice uniforme: no hay sesgo de módulo y no hace falta muestreo por
 * rechazo. Si alguien cambia el alfabeto a un tamaño que no sea potencia de
 * dos, esta cuenta deja de valer y hay que volver al rechazo.
 */
const ALPHABET_INDEX_MASK = INVITE_TOKEN_ALPHABET.length - 1;

/** Longitud del sufijo aleatorio del identificador de ticket. */
const TICKET_ID_SUFFIX_LENGTH = 6;

/**
 * Prefijo del `public_token` de una vacante. Se conserva el que ya llevaban las
 * filas existentes: sirve para reconocer de un vistazo, en la base o en un log,
 * que la cadena es el enlace general de una vacante y no el token de un ticket.
 */
export const PUBLIC_ROLE_TOKEN_PREFIX = 'pub-';

/**
 * Longitud de la parte aleatoria del `public_token`.
 * 24 × log2(32) = 120 bits.
 *
 * Es más que los 80 bits del token de ticket a propósito: el token de ticket
 * caduca en 24 horas y vale para un solo candidato, mientras que el
 * `public_token` no caduca, se comparte en anuncios y su única comprobación es
 * la igualdad exacta en `/api/public-interview`, que no limita intentos.
 */
export const PUBLIC_ROLE_TOKEN_RANDOM_LENGTH = 24;

/**
 * Devuelve `size` bytes del CSPRNG de la plataforma.
 *
 * `crypto.getRandomValues` existe en Node 18+, en los navegadores y en jsdom,
 * que es lo que permite compartir este módulo entre servidor y cliente.
 */
function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Traduce bytes aleatorios a caracteres del alfabeto del token. */
function encodeWithAlphabet(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += INVITE_TOKEN_ALPHABET[byte & ALPHABET_INDEX_MASK];
  }
  return out;
}

/**
 * Genera el token de acceso a una entrevista.
 *
 * Reemplaza a los dos generadores basados en `Math.random()`. La unicidad la
 * garantiza en última instancia el índice `UNIQUE` de la columna; con 80 bits
 * la probabilidad de colisión es despreciable para el volumen del producto.
 */
export function generateInviteToken(): string {
  return encodeWithAlphabet(randomBytes(INVITE_TOKEN_LENGTH));
}

/**
 * Genera el identificador de la fila de `interview_tickets`.
 *
 * NO es una credencial: la clave de acceso es el token. Es la clave primaria
 * (`TEXT`), y mantiene la forma `ticket-<epoch_ms>-<sufijo>` que ya tenían las
 * filas existentes para que el orden por identificador siga siendo temporal.
 * El sufijo también sale del CSPRNG, pero por una razón distinta: evitar
 * colisiones de clave primaria entre invitaciones creadas en el mismo
 * milisegundo.
 *
 * `now` se recibe en lugar de leer el reloj aquí para que el identificador, el
 * `created_at` y el `expires_at` de la misma invitación usen el mismo instante.
 */
export function generateTicketId(now: number): string {
  const suffix = encodeWithAlphabet(randomBytes(TICKET_ID_SUFFIX_LENGTH));
  return `ticket-${now}-${suffix.toLowerCase()}`;
}

/**
 * Genera el `public_token` de una vacante (`roles.public_token`).
 *
 * ES UNA CREDENCIAL: es lo único que abre `/interview/public/[publicToken]`, o
 * sea el enlace general de entrevista de la vacante. Quien lo adivina entra al
 * proceso de selección. Antes se construía en el componente de creación de
 * vacantes como `pub-<epoch_base36>-<6 chars de Math.random()>`: la mitad del
 * valor era el reloj (público y adivinable) y la otra mitad venía del mismo
 * generador no criptográfico que ya se sustituyó para los tickets, con unos 30
 * bits efectivos. Aquí se genera entero con el CSPRNG.
 *
 * COMPATIBILIDAD CON LOS TOKENS YA EMITIDOS
 * -----------------------------------------
 * Se comprobó qué valida el `public_token` antes de cambiar su forma:
 *
 *  - `supabase/migrations/20260601_public_interview_links.sql:10-13`: la columna
 *    es `TEXT UNIQUE` con un índice; no hay `CHECK` de longitud, de alfabeto ni
 *    de prefijo. Es la única migración que la toca.
 *  - `src/app/api/public-interview/route.ts:36` y `:112`: el `GET` y el `POST`
 *    resuelven la vacante con `.eq('public_token', token)`. Igualdad exacta.
 *  - `src/app/interview/public/[publicToken]/page.tsx`: pasa el segmento
 *    dinámico tal cual a esa API; no mide longitud ni valida caracteres.
 *  - La política `public_role_by_token` solo exige `public_token IS NOT NULL AND
 *    public_token != ''`.
 *  - `src/store/adminStore.ts` y `src/hooks/useRoles.ts` solo lo copian entre
 *    fila y modelo; `create-role/page.tsx` lo interpola en la URL del enlace.
 *
 * Nada parsea el token ni valida su forma, así que los tokens antiguos —con
 * marca de tiempo y en base36— siguen resolviendo igual y no hace falta migrar
 * ninguna fila. Se mantiene el prefijo `pub-` y se elimina el segmento del
 * reloj, que no aportaba entropía y no lo lee nadie. El sufijo se pasa a
 * minúsculas para que el token siga siendo, como los ya emitidos, una cadena de
 * una sola caja: así una URL que alguien reescriba en minúsculas al copiarla no
 * deja de resolver.
 */
export function generatePublicRoleToken(): string {
  const random = encodeWithAlphabet(randomBytes(PUBLIC_ROLE_TOKEN_RANDOM_LENGTH));
  return `${PUBLIC_ROLE_TOKEN_PREFIX}${random.toLowerCase()}`;
}
