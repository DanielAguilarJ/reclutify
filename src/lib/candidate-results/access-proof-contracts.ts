import { z } from 'zod';

import { MAX_INTERVIEW_TICKET_TOKEN_LENGTH } from '@/lib/interview-tickets/contracts';

/**
 * Contrato de la PRUEBA DE ACCESO de `/api/candidate-results`.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * La ruta escribe con `service_role`, que ignora RLS. Ya resolvía `org_id` en el
 * servidor, comprobaba la pertenencia de la fila en el `POST` y limitaba las
 * columnas del `PATCH`, pero seguía sin exigir NADA a quien llama: con un `id`
 * nuevo y cualquier `roleId` conocido se podían inyectar candidatos con
 * evaluaciones falsas en el pipeline de cualquier organización. Y los `roleId`
 * son públicamente listables, porque `roles` tiene `anon_roles_select
 * USING (true)`.
 *
 * La prueba de acceso es la credencial que demuestra que quien escribe participa
 * en la entrevista. Hay tres, una por cada camino real de escritura:
 *
 *  1. `ticketToken` — el flujo `/interview/t/[token]`. La página ya tiene el
 *     token en la ruta.
 *  2. `publicToken` — el flujo `/interview/public/[publicToken]`. Ídem.
 *  3. La sesión del panel — el camino de `/admin/pipeline`, que también llama a
 *     `updateCandidate` y NO tiene token de candidato. No viaja en el cuerpo:
 *     son las cookies de Supabase, así que la ausencia de las dos claves de
 *     arriba es lo que hace que el servidor mire la sesión.
 *
 * ESTE MÓDULO ES ISOMORFO A PROPÓSITO
 * -----------------------------------
 * Lo importan el store del navegador (para construir el cuerpo) y la validación
 * del servidor (para leerlo), igual que `src/lib/interview-tickets/contracts.ts`.
 * Por eso no lleva `server-only` y no toca la base de datos: la resolución
 * contra `interview_tickets` y `roles` vive en `access-proof.ts`.
 */

/**
 * Tope de longitud de las dos credenciales.
 *
 * El token de ticket ya tiene el suyo (`MAX_INTERVIEW_TICKET_TOKEN_LENGTH`), y
 * el `public_token` es más corto: `pub-` más 24 caracteres los nuevos, y
 * `pub-<base36>-<6>` los heredados (`src/lib/invites/token.ts`). Se comparte el
 * mismo tope holgado para no rechazar formatos antiguos y, a la vez, no pasar
 * cadenas arbitrariamente largas a la base de datos.
 */
export const MAX_ACCESS_PROOF_TOKEN_LENGTH = MAX_INTERVIEW_TICKET_TOKEN_LENGTH;

/** Las dos credenciales que viajan en el cuerpo. La sesión no es una de ellas. */
export const ACCESS_PROOF_BODY_FIELDS = ['ticketToken', 'publicToken'] as const;

export type AccessProofBodyField = (typeof ACCESS_PROOF_BODY_FIELDS)[number];

/**
 * Credencial presentada, ya normalizada.
 *
 * `kind: 'session'` no aparece: la sesión no se declara, se comprueba. Lo que el
 * cuerpo puede traer es un token o ninguno.
 */
export type CandidateResultAccessProof =
  | { kind: 'ticket'; token: string }
  | { kind: 'public-link'; token: string };

const tokenSchema = z.string().trim().min(1).max(MAX_ACCESS_PROOF_TOKEN_LENGTH);

/**
 * Las dos claves de credencial dentro de un cuerpo que trae muchas más.
 *
 * `looseObject` porque el resto del cuerpo (el propio resultado del candidato o
 * el objeto `updates`) lo validan otros esquemas; aquí solo se extraen las dos
 * claves de la credencial. `null` se acepta y equivale a ausencia, para que el
 * cliente pueda enviar el campo siempre sin tener que omitirlo.
 */
const accessProofBodySchema = z.looseObject({
  ticketToken: tokenSchema.nullish(),
  publicToken: tokenSchema.nullish(),
});

export type AccessProofParseResult =
  | { ok: true; proof: CandidateResultAccessProof | null }
  | { ok: false; reason: 'malformed-proof' | 'ambiguous-proof'; message: string };

/**
 * Extrae la credencial del cuerpo de la petición.
 *
 * No decide nada sobre su validez —eso exige la base de datos—, solo su forma:
 *
 *  - ninguna de las dos claves → `proof: null`, y el servidor mirará la sesión;
 *  - exactamente una → la credencial normalizada;
 *  - las dos a la vez → rechazo. No es una petición legítima de ningún flujo, y
 *    aceptarla obligaría a elegir un orden de precedencia que sería una
 *    ambigüedad más en un camino de autorización;
 *  - una clave presente pero vacía o no textual → rechazo, en lugar de tratarla
 *    como ausente y caer en la comprobación de sesión, que es un camino
 *    distinto del que el cliente pidió.
 */
export function parseCandidateResultAccessProof(body: unknown): AccessProofParseResult {
  const parsed = accessProofBodySchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      reason: 'malformed-proof',
      message: 'Invalid access proof',
    };
  }

  const ticketToken = parsed.data.ticketToken ?? null;
  const publicToken = parsed.data.publicToken ?? null;

  if (ticketToken !== null && publicToken !== null) {
    return {
      ok: false,
      reason: 'ambiguous-proof',
      message: 'Provide either ticketToken or publicToken, not both',
    };
  }

  if (ticketToken !== null) return { ok: true, proof: { kind: 'ticket', token: ticketToken } };
  if (publicToken !== null) {
    return { ok: true, proof: { kind: 'public-link', token: publicToken } };
  }

  return { ok: true, proof: null };
}

/**
 * Traduce la credencial a las claves que van en el cuerpo JSON.
 *
 * Lo usa el navegador para no repetir en dos sitios el nombre de cada campo. Sin
 * credencial devuelve un objeto vacío: es el camino del panel, donde la
 * credencial son las cookies de sesión.
 */
export function accessProofRequestFields(
  proof: CandidateResultAccessProof | null,
): Partial<Record<AccessProofBodyField, string>> {
  if (!proof) return {};
  return proof.kind === 'ticket' ? { ticketToken: proof.token } : { publicToken: proof.token };
}
