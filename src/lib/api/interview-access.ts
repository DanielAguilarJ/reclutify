import 'server-only';

import {
  parseCandidateResultAccessProof,
  type CandidateResultAccessProof,
} from '@/lib/candidate-results/access-proof-contracts';
import {
  authorizeCredentialForRole,
  requireCandidateResultCredential,
  type CandidateResultCredential,
} from '@/lib/candidate-results/access-proof';

import { ApiError, API_ERROR_CODES } from './errors';

/**
 * Autorización de las rutas de IA de la entrevista.
 *
 * POR QUÉ NO BASTA CON «EXIGIR SESIÓN»
 * ------------------------------------
 * `/api/chat` y `/api/evaluate` los llama el candidato, y el candidato NO tiene
 * cuenta en dos de los tres flujos de entrada:
 *
 *  - `/interview/t/[token]` — invitación por correo. El candidato no se registra.
 *  - `/interview/public/[publicToken]` — enlace general de la vacante. Tampoco.
 *  - `/admin/pipeline` — el reclutador reintenta una evaluación. Aquí sí hay
 *    sesión, pero es de empleador, no de candidato.
 *
 * Un `requireAuthenticatedUser()` en `/api/chat` dejaría fuera a los dos
 * primeros, que son la mayoría del uso real del producto. Por eso la credencial
 * aceptada es la misma que ya define `/api/candidate-results`: token de ticket,
 * `public_token` de la vacante, o sesión de `owner`/`admin` de la organización
 * dueña de la vacante.
 *
 * ESTE MÓDULO NO REIMPLEMENTA NADA
 * --------------------------------
 * Toda la resolución vive en `src/lib/candidate-results/access-proof.ts`, que ya
 * estaba escrito y probado (`candidate-results-authorization.test.ts`). Aquí solo
 * se adapta su resultado —un objeto discriminado— a una excepción `ApiError`,
 * que es la forma que consumen las rutas nuevas a través de `handleApiError`.
 *
 * Mantener una sola definición de «quién puede actuar sobre esta entrevista» es
 * el punto: si mañana se añade un cuarto flujo de entrada, se añade en
 * `access-proof.ts` y las rutas de IA lo heredan sin tocarlas.
 */

/** Credencial validada y vacante que acredita. */
export interface InterviewAccessGrant {
  /** Con qué se autorizó: `'ticket'`, `'public-link'` o `'session'`. */
  via: CandidateResultCredential['kind'];
  /** Vacante acreditada. Resuelta en el servidor, nunca aceptada del cuerpo. */
  roleId: string;
  /** Organización dueña de esa vacante. */
  orgId: string;
  /** Identificador del usuario cuando la credencial fue una sesión. */
  userId: string | null;
}

/**
 * Lee la credencial del cuerpo sin resolverla contra la base.
 *
 * Se expone por separado porque el identificador de cuota del limitador de tasa
 * se necesita ANTES de gastar consultas: una petición sin credencial válida debe
 * consumir cuota igual, o el limitador sería trivial de eludir enviando basura.
 *
 * @throws {ApiError} 400 si el cuerpo trae las dos credenciales a la vez o una
 *   malformada.
 */
export function readInterviewAccessProof(body: unknown): CandidateResultAccessProof | null {
  const parsed = parseCandidateResultAccessProof(body);

  if (!parsed.ok) {
    throw new ApiError(400, parsed.message, API_ERROR_CODES.VALIDATION_FAILED, parsed.reason);
  }

  return parsed.proof;
}

/**
 * Exige que quien llama pueda actuar sobre la entrevista de `roleId`.
 *
 * Se resuelve en dos pasos separados, igual que en `/api/candidate-results`:
 * primero «¿hay alguna credencial?» (para irse con `401` sin haber leído ni una
 * fila del producto) y después «¿acredita ESTA vacante?».
 *
 * Ninguna de las dos comprobaciones escribe, así que un rechazo garantiza que no
 * hubo cambios.
 *
 * @param body Cuerpo ya parseado de la petición, del que se extrae la credencial.
 * @param roleId Vacante sobre la que se quiere actuar.
 * @throws {ApiError} 401 sin credencial o con credencial inválida; 403 si
 *   acredita otra vacante; 422 si la vacante no tiene organización; 500 si una
 *   consulta de autorización falla.
 */
export async function requireInterviewAccess(
  body: unknown,
  roleId: string,
): Promise<InterviewAccessGrant> {
  const proof = readInterviewAccessProof(body);

  const credentialResult = await requireCandidateResultCredential(proof);

  if (!credentialResult.ok) {
    throw new ApiError(
      credentialResult.status,
      credentialResult.message,
      credentialResult.status === 401
        ? API_ERROR_CODES.UNAUTHORIZED
        : API_ERROR_CODES.INTERNAL,
      credentialResult.reason,
    );
  }

  const access = await authorizeCredentialForRole(credentialResult.credential, roleId);

  if (!access.ok) {
    throw new ApiError(
      access.status,
      access.message,
      access.status === 401
        ? API_ERROR_CODES.UNAUTHORIZED
        : access.status === 403
          ? API_ERROR_CODES.FORBIDDEN
          : API_ERROR_CODES.INTERNAL,
      access.reason,
    );
  }

  return {
    via: access.via,
    roleId: access.roleId,
    orgId: access.orgId,
    userId:
      credentialResult.credential.kind === 'session' ? credentialResult.credential.userId : null,
  };
}

/**
 * Identificador de cuota derivado de la credencial presentada.
 *
 * Prefiere el token o el usuario sobre la IP: es lo que permite que dos
 * candidatos detrás del mismo NAT corporativo no compartan cuota, y que un
 * atacante que rote de IP no multiplique la suya.
 *
 * Devuelve `null` cuando no hay credencial en el cuerpo, y entonces el llamante
 * cae a la IP.
 */
export function accessProofRateLimitSubject(
  proof: CandidateResultAccessProof | null,
): string | null {
  return proof ? `${proof.kind}:${proof.token}` : null;
}

/**
 * Autoriza una ruta que tiene DOS caminos legítimos: el del candidato, que actúa
 * sobre una entrevista concreta, y el del panel, que actúa sobre su organización.
 *
 * POR QUÉ HACE FALTA
 * ------------------
 * `/api/webhooks/candidate-completed` la llaman dos pantallas distintas:
 *
 *  - `InterviewComplete`, al terminar la entrevista. Tiene `roleId` real y una
 *    credencial de candidato.
 *  - `/admin/settings`, al pulsar «probar webhook». Tiene sesión de empleador y
 *    NO tiene ninguna entrevista: envía un `roleId` de relleno
 *    (`'test-role-001'`) que no existe en la base.
 *
 * Exigir `roleId` siempre rompería el botón de prueba; no exigirlo nunca dejaría
 * al camino del candidato sin comprobar a qué entrevista pertenece. Con `roleId`
 * se comprueba la entrevista; sin él, se exige sesión de organización, que es una
 * credencial más fuerte, no más débil.
 *
 * @param body Cuerpo ya parseado, del que se extrae la credencial de candidato.
 * @param roleId Vacante concreta, o `null` para el camino del panel.
 */
export async function requireInterviewOrOrgAccess(
  body: unknown,
  roleId: string | null,
): Promise<InterviewAccessGrant> {
  if (roleId) return requireInterviewAccess(body, roleId);

  // Sin vacante concreta el único camino aceptable es la sesión del panel. Se
  // importa aquí y no arriba para no crear una dependencia circular entre los
  // dos módulos de autorización.
  const { requireOrgMembership } = await import('./auth');
  const membership = await requireOrgMembership();

  return {
    via: 'session',
    roleId: '',
    orgId: membership.orgId,
    userId: membership.user.id,
  };
}
