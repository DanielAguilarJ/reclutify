import { NextResponse, type NextRequest } from 'next/server';

import { ApiError, handleApiError } from '@/lib/api/errors';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  publicInterviewRegisterSchema,
  publicInterviewTokenQuerySchema,
} from '@/lib/schemas/api';
import {
  createPublicCandidateResult,
  loadInterviewOrganization,
  loadInterviewRoleByPublicToken,
} from '@/lib/services/interview.service';

/**
 * Entrevista por enlace público de la vacante.
 *
 * `GET`  — valida el `public_token` y devuelve los datos que la pantalla necesita.
 * `POST` — registra al candidato y crea su fila en `candidate_results`.
 *
 * POR QUÉ ESTA RUTA NO EXIGE SESIÓN
 * ---------------------------------
 * Es el flujo del enlace general: el candidato no tiene cuenta y su credencial es
 * el `public_token`, que va en la URL que le compartió la empresa. Eso está bien
 * y no cambia.
 *
 * QUÉ ESTABA MAL
 * --------------
 * 1. **Sin tope de tasa en el `POST`.** Cada llamada INSERTA una fila en
 *    `candidate_results` de la organización. Un bucle llenaba el pipeline de la
 *    empresa de candidatos falsos, que es a la vez basura operativa y una
 *    denegación de servicio sobre el trabajo del reclutador.
 *
 * 2. **Sin validación.** `candidateName` y `candidateEmail` se insertaban con
 *    cualquier longitud y sin comprobar el formato del correo. El correo es el
 *    único identificador del candidato en ese flujo.
 *
 * 3. **Identificador de fila predecible.** `cr-${Date.now()}-${Math.random()...}`.
 *    `Math.random()` no es criptográfico, y ese `resultId` es lo que el cliente
 *    usa después para escribir su propia entrevista. Se pasa a `randomUUID()`.
 *
 * SOBRE LA RÚBRICA EN LA RESPUESTA (decisión consciente, NO un descuido)
 * ---------------------------------------------------------------------
 * `role.topics` incluye `rubric` con los descriptores `excellent` / `acceptable` /
 * `poor` y el peso de cada criterio, y esta ruta lo devuelve completo. Es
 * tentador recortarlo como hace `src/lib/jobs/public-projection.ts` en el portal
 * de empleo, pero NO es el mismo caso, y el propio repositorio ya lo razonó:
 *
 *   «La entrevista SÍ necesita la rúbrica completa para evaluar.
 *   `/api/interview/ticket` y `/api/public-interview` leen `topics` sin reducir,
 *   corren con `service_role` y exigen una credencial —el token del ticket o el
 *   `public_token` del puesto—. No usan esta proyección y no deben usarla.»
 *   (`src/lib/jobs/public-projection.ts`)
 *
 * La diferencia con el portal es la credencial: el portal no pide ninguna, aquí
 * hace falta el `public_token`. Y el cliente la necesita de verdad: `/api/chat`
 * recibe `allTopics` con `rubric` para conducir la entrevista, y `/api/evaluate`
 * recalcula la puntuación ponderada a partir de los pesos que llegan en `topics`.
 * Recortarla aquí dejaría todas las puntuaciones con peso 5, es decir, rompería
 * la evaluación.
 *
 * Queda anotado como deuda técnica en `REPORTE_REFACTOR.md`: la corrección de
 * fondo es que `/api/chat` y `/api/evaluate` lean la rúbrica de `roles` por su
 * cuenta con el `roleId` que ya reciben, y que deje de viajar al cliente. Eso
 * elimina además la inyección de rúbrica en el prompt. Es un cambio del núcleo de
 * la entrevista y no entra en esta ronda.
 */

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const query = publicInterviewTokenQuerySchema.parse({
      token: req.nextUrl.searchParams.get('token') ?? '',
    });

    // El tope se aplica también al GET: sin él, la ruta sirve de oráculo para
    // adivinar `public_token` a fuerza bruta.
    await enforceRateLimit(req, RATE_LIMITS.PUBLIC_REGISTER, null);

    // La resolución vive en el servicio: esta misma consulta estaba duplicada en el `GET`
    // y en el `POST` de este archivo, con listas de columnas DISTINTAS, así que la pantalla
    // del candidato mostraba menos datos después de registrarse que antes.
    const lookup = await loadInterviewRoleByPublicToken(query.token);

    if (lookup.status === 'error') {
      throw ApiError.misconfigured(lookup.message);
    }

    // Token inexistente y fila ilegible comparten respuesta: distinguirlos convertiría la
    // ruta en un confirmador de enlaces válidos.
    if (lookup.status === 'not-found') throw ApiError.notFound('Invalid or expired link');

    const { role } = lookup;
    const org = await loadInterviewOrganization(role.orgId);

    return NextResponse.json({
      // El servicio ya normalizó la forma, así que la respuesta es su contrato tal cual.
      role: { ...role, orgId: role.orgId },
      org,
    });
  } catch (error) {
    return handleApiError(error, '[public-interview:GET]');
  }
}

export async function POST(req: NextRequest) {
  try {
    // El tope va ANTES de leer el cuerpo y de tocar la base: es el control que
    // impide llenar el pipeline de la organización con un bucle.
    await enforceRateLimit(req, RATE_LIMITS.PUBLIC_REGISTER, null);

    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = publicInterviewRegisterSchema.parse(rawBody);

    const lookup = await loadInterviewRoleByPublicToken(body.token);

    if (lookup.status === 'error') {
      throw ApiError.misconfigured(lookup.message);
    }

    if (lookup.status === 'not-found') throw ApiError.notFound('Invalid link');

    const { role } = lookup;

    const created = await createPublicCandidateResult({
      role,
      candidateName: body.candidateName,
      candidateEmail: body.candidateEmail,
      candidatePhone: body.candidatePhone,
      linkedinUrl: body.linkedinUrl,
    });

    if (created.status === 'error') {
      throw ApiError.misconfigured(created.message);
    }

    const resultId = created.resultId;

    return NextResponse.json({
      resultId,
      roleId: role.id,
      roleTitle: role.title,
      interviewDuration: role.interviewDuration,
      interviewMode: role.interviewMode,
      topics: role.topics,
    });
  } catch (error) {
    return handleApiError(error, '[public-interview:POST]');
  }
}
