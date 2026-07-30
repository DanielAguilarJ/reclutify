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
 *  - `src/store/ticketStore.ts`: `fetchTicketByToken` filtra con
 *    `.eq('token', token)` y `getTicketByToken` compara cadenas completas.
 *    Igualdad exacta, sin validación de forma.
 *  - `src/app/interview/t/[token]/page.tsx`: usa el segmento dinámico tal cual
 *    para esas dos búsquedas; no mide longitud ni valida caracteres.
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
