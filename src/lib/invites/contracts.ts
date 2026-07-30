import { z } from 'zod';

/**
 * Contrato del cuerpo de una petición de invitación.
 *
 * Lo comparten la ruta `/api/invite-candidates` y `applyToJob`, así que el
 * esquema define la entrada del módulo compartido, no solo la de la ruta.
 *
 * POR QUÉ HAY UN TOPE EN `candidates`
 * -----------------------------------
 * Cada elemento del array produce DOS escrituras: una fila en
 * `interview_tickets` y su espejo en `candidate_invites`. Antes no había
 * límite, así que una sola petición podía pedir cientos de miles de
 * inserciones secuenciales con la clave de servicio. El tope convierte eso en
 * un `400` barato antes de tocar la base.
 *
 * POR QUÉ ESTE ESQUEMA NO ES `.strict()`
 * --------------------------------------
 * El resto de esquemas del proyecto (`src/lib/training/contracts.ts`) usan
 * `.strict()` porque validan un cuerpo que la propia interfaz construye campo a
 * campo. Aquí el cuerpo es un lote de invitaciones que puede venir de una
 * exportación o de una hoja de cálculo con columnas de sobra, así que las claves
 * adicionales se descartan en lugar de tumbar la petición completa. No es una
 * concesión de seguridad: Zod las elimina del objeto validado, de modo que
 * nunca llegan a la base de datos, y lo que decide si la petición se acepta es
 * la autorización de la ruta, no la forma del payload.
 */

/**
 * Máximo de candidatos por petición.
 *
 * 50 destinatarios cubren con holgura el caso real (una hornada de invitaciones
 * para una vacante) y acotan el trabajo de una petición a 100 escrituras.
 */
export const MAX_INVITE_CANDIDATES = 50;

/**
 * Un destinatario.
 *
 * `email` se recorta y se exige no vacío: antes, un elemento con `email` falsy
 * se saltaba en silencio y desaparecía de la respuesta sin explicación. Ahora la
 * petición se rechaza completa, que es información útil para el integrador.
 *
 * No se valida el formato del correo más allá de la longitud: esta ruta solo lo
 * almacena y lo usa como identificador de la fila espejo. Quien decide si una
 * dirección es entregable es el proveedor de correo.
 */
const inviteCandidateSchema = z.object({
  email: z.string().trim().min(3).max(320),
  name: z.string().trim().max(200).optional(),
});

export const inviteCandidatesRequestSchema = z.object({
  /** `roles.id` es `TEXT` (por ejemplo `role-1713456789`), no un UUID. */
  roleId: z.string().trim().min(1).max(200),
  roleTitle: z.string().trim().min(1).max(300),
  /**
   * Idioma de la entrevista. Se acepta cualquier cadena corta y el servicio
   * aplica la misma regla de siempre (`'en'` o, en cualquier otro caso, `'es'`)
   * para no rechazar payloads que hoy funcionan.
   */
  language: z.string().trim().max(20).optional(),
  candidates: z.array(inviteCandidateSchema).min(1).max(MAX_INVITE_CANDIDATES),
});

export type InviteCandidatesRequest = z.infer<typeof inviteCandidatesRequestSchema>;
