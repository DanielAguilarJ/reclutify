import 'server-only';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Acceso a datos de la entrevista.
 *
 * QUÉ CONCENTRA
 * -------------
 * Las rutas resolvían por su cuenta las mismas tres cosas, con `select` distintos cada
 * una:
 *
 *  - la vacante por `id` (`/api/group-interview`, `interview-tickets/service.ts`);
 *  - la vacante por `public_token` — `/api/public-interview` la consultaba DOS VECES en el
 *    mismo archivo, con listas de columnas diferentes, así que el `GET` y el `POST`
 *    devolvían formas distintas de la misma vacante;
 *  - la creación de la fila de `candidate_results`.
 *
 * Concentrarlo aquí no es orden por gusto: la lista de columnas de una vacante decide qué
 * sale de la base, y tenerla escrita en cinco sitios es cómo se filtra `public_token` en
 * una respuesta por descuido.
 *
 * POR QUÉ TODO CORRE CON LA CLAVE DE SERVICIO
 * -------------------------------------------
 * El candidato de los flujos de ticket y de enlace público NO tiene sesión, así que RLS no
 * puede autorizarlo: su credencial es el token. Por eso **este módulo no autoriza nada**.
 * Autoriza quien lo llama, con `requireInterviewAccess` (`src/lib/api/interview-access.ts`)
 * o con `requireOrgMembership`, ANTES de invocar cualquier función de aquí.
 *
 * La regla es la misma que documenta `src/utils/supabase/admin.ts`: todo endpoint que use
 * la clave de servicio valida identidad y permisos por su cuenta.
 */

/** Columnas de la vacante que necesita conducir una entrevista. */
const INTERVIEW_ROLE_COLUMNS =
  'id, title, description, location, salary, job_type, interview_duration, interview_mode, topics, org_id';

/**
 * Vacante tal como la consume el flujo de entrevista.
 *
 * `public_token` NO está, y esa ausencia es deliberada: devolverlo convertiría cualquier
 * respuesta que incluya una vacante en un oráculo de enlaces públicos. Ver el mismo
 * razonamiento en `src/lib/interview-tickets/contracts.ts`.
 */
export interface InterviewRole {
  id: string;
  title: string;
  description: string;
  location: string | null;
  salary: string | null;
  jobType: string | null;
  interviewDuration: number;
  interviewMode: 'restricted' | 'internal';
  /** Criterios con su rúbrica. La entrevista los necesita para evaluar. */
  topics: unknown[];
  orgId: string | null;
}

/**
 * Fila cruda de `roles`.
 *
 * Se valida con Zod en lugar de castear: la columna `topics` es JSONB y `interview_mode`
 * una cadena libre en la base, así que sin comprobación una fila corrupta llegaría al
 * motor de tiempos como `undefined` y reventaría a mitad del turno.
 */
const interviewRoleRowSchema = z.looseObject({
  id: z.string(),
  title: z.string().catch(''),
  description: z.string().nullable().catch(null),
  location: z.string().nullable().catch(null),
  salary: z.string().nullable().catch(null),
  job_type: z.string().nullable().catch(null),
  interview_duration: z.number().nullable().catch(null),
  interview_mode: z.enum(['restricted', 'internal']).catch('restricted'),
  topics: z.unknown(),
  org_id: z.string().nullable().catch(null),
});

/** Normaliza la fila al contrato del flujo de entrevista. */
function toInterviewRole(raw: unknown): InterviewRole | null {
  const parsed = interviewRoleRowSchema.safeParse(raw);
  if (!parsed.success) return null;

  const row = parsed.data;

  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    location: row.location,
    salary: row.salary,
    jobType: row.job_type,
    // 30 minutos es el defecto del producto, el mismo que aplicaban las rutas.
    interviewDuration: row.interview_duration ?? 30,
    interviewMode: row.interview_mode,
    topics: Array.isArray(row.topics) ? row.topics : [],
    orgId: row.org_id,
  };
}

/** Resultado de una búsqueda de vacante: encontrada, ausente, o fallo de consulta. */
export type InterviewRoleLookup =
  | { status: 'found'; role: InterviewRole }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/**
 * Carga una vacante por su identificador.
 *
 * @param roleId Identificador de la vacante.
 */
export async function loadInterviewRoleById(roleId: string): Promise<InterviewRoleLookup> {
  if (!roleId.trim()) return { status: 'not-found' };

  const { data, error } = await createAdminClient()
    .from('roles')
    .select(INTERVIEW_ROLE_COLUMNS)
    .eq('id', roleId)
    .maybeSingle();

  if (error) {
    console.error('[interview.service] role lookup failed:', error.message);
    return { status: 'error', message: 'Could not load the role' };
  }

  const role = toInterviewRole(data);

  // Una fila que no pasa la validación se trata como ausente, no como error: el llamante
  // no puede hacer nada distinto y devolver `500` sugeriría un problema transitorio.
  return role ? { status: 'found', role } : { status: 'not-found' };
}

/**
 * Carga una vacante por el `public_token` de su enlace general.
 *
 * Es la consulta que `/api/public-interview` tenía duplicada en su `GET` y su `POST`, con
 * listas de columnas distintas: el `GET` devolvía `location` y `salary` y el `POST` no,
 * así que la pantalla del candidato mostraba menos datos después de registrarse que antes.
 */
export async function loadInterviewRoleByPublicToken(token: string): Promise<InterviewRoleLookup> {
  if (!token.trim()) return { status: 'not-found' };

  const { data, error } = await createAdminClient()
    .from('roles')
    .select(INTERVIEW_ROLE_COLUMNS)
    .eq('public_token', token)
    .maybeSingle();

  if (error) {
    console.error('[interview.service] public token lookup failed:', error.message);
    return { status: 'error', message: 'Could not resolve the interview link' };
  }

  const role = toInterviewRole(data);

  // Token inexistente y fila ilegible comparten respuesta: distinguirlos convertiría la
  // ruta en un confirmador de enlaces válidos.
  return role ? { status: 'found', role } : { status: 'not-found' };
}

/** Datos de la organización que la pantalla del candidato muestra. */
export interface InterviewOrganization {
  name: string;
  planTier: string;
}

/**
 * Carga los datos de marca de la organización.
 *
 * Pide SOLO `name` y `plan_tier`. `organizations` contiene los identificadores de Stripe y
 * el estado de suscripción, y `plan_tier` es lo único de esa tabla que la pantalla del
 * candidato necesita —gobierna la marca blanca del encabezado—. Ver la migración
 * `202608020002`, que revoca las columnas de facturación.
 */
export async function loadInterviewOrganization(orgId: string | null): Promise<InterviewOrganization> {
  const fallback: InterviewOrganization = { name: '', planTier: 'starter' };

  if (!orgId?.trim()) return fallback;

  const { data, error } = await createAdminClient()
    .from('organizations')
    .select('name, plan_tier')
    .eq('id', orgId)
    .maybeSingle();

  if (error) {
    // La marca es cosmética: un fallo aquí no debe impedir la entrevista.
    console.warn('[interview.service] organization lookup failed:', error.message);
    return fallback;
  }

  return { name: data?.name ?? '', planTier: data?.plan_tier ?? 'starter' };
}

/** Datos del candidato que llega por el enlace general. */
export interface PublicCandidateRegistration {
  role: InterviewRole;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  linkedinUrl: string;
}

export type CandidateResultCreation =
  | { status: 'created'; resultId: string }
  | { status: 'error'; message: string };

/**
 * Crea la fila de resultado del candidato que entra por el enlace general.
 *
 * El identificador se genera con `randomUUID` y no con `Date.now()` más `Math.random()`,
 * que es lo que había: ese `resultId` es la referencia con la que el cliente escribe
 * después su propia entrevista, así que no debe ser adivinable.
 */
export async function createPublicCandidateResult(
  input: PublicCandidateRegistration,
): Promise<CandidateResultCreation> {
  const resultId = `cr-${randomUUID()}`;

  const { error } = await createAdminClient()
    .from('candidate_results')
    .insert({
      id: resultId,
      org_id: input.role.orgId,
      candidate_name: input.candidateName,
      candidate_email: input.candidateEmail,
      candidate_phone: input.candidatePhone,
      candidate_linkedin: input.linkedinUrl,
      role_id: input.role.id,
      role_title: input.role.title,
      date: Date.now(),
      status: 'in-progress',
      duration: 0,
      transcript: [],
      source: 'public_link',
    });

  if (error) {
    console.error('[interview.service] candidate result insert failed:', error.message);
    return { status: 'error', message: 'Failed to register candidate' };
  }

  return { status: 'created', resultId };
}
