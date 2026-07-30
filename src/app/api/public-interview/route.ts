import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

import { ApiError, handleApiError } from '@/lib/api/errors';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import {
  publicInterviewRegisterSchema,
  publicInterviewTokenQuerySchema,
} from '@/lib/schemas/api';
import { createAdminClient } from '@/utils/supabase/admin';

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

    // Clave de servicio: la lectura por `public_token` tiene que saltarse RLS
    // porque la credencial es el propio token, no una sesión.
    const admin = createAdminClient();

    const { data: role, error } = await admin
      .from('roles')
      .select(
        'id, title, description, location, salary, job_type, interview_duration, interview_mode, topics, org_id',
      )
      .eq('public_token', query.token)
      .maybeSingle();

    if (error) {
      throw ApiError.misconfigured('Could not resolve the interview link', error);
    }

    // Token inexistente y fila ilegible comparten respuesta: distinguirlos
    // convertiría la ruta en un confirmador de enlaces válidos.
    if (!role) throw ApiError.notFound('Invalid or expired link');

    let orgName = '';
    let orgPlanTier = 'starter';

    if (role.org_id) {
      const { data: org } = await admin
        .from('organizations')
        .select('name, plan_tier')
        .eq('id', role.org_id)
        .maybeSingle();

      if (org) {
        orgName = org.name ?? '';
        orgPlanTier = org.plan_tier ?? 'starter';
      }
    }

    return NextResponse.json({
      role: {
        id: role.id,
        title: role.title,
        description: role.description,
        location: role.location,
        salary: role.salary,
        jobType: role.job_type,
        interviewDuration: role.interview_duration ?? 30,
        interviewMode: role.interview_mode || 'restricted',
        topics: Array.isArray(role.topics) ? role.topics : [],
        orgId: role.org_id,
      },
      org: { name: orgName, planTier: orgPlanTier },
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

    const admin = createAdminClient();

    const { data: role, error: roleError } = await admin
      .from('roles')
      .select('id, title, org_id, interview_duration, interview_mode, topics')
      .eq('public_token', body.token)
      .maybeSingle();

    if (roleError) {
      throw ApiError.misconfigured('Could not resolve the interview link', roleError);
    }

    if (!role) throw ApiError.notFound('Invalid link');

    // `randomUUID` en vez de `Date.now()` + `Math.random()`: este identificador es
    // el que el cliente usa después para escribir su propia entrevista, así que no
    // debe ser adivinable.
    const resultId = `cr-${randomUUID()}`;

    const { error: insertError } = await admin.from('candidate_results').insert({
      id: resultId,
      org_id: role.org_id,
      candidate_name: body.candidateName,
      candidate_email: body.candidateEmail,
      candidate_phone: body.candidatePhone,
      candidate_linkedin: body.linkedinUrl,
      role_id: role.id,
      role_title: role.title,
      date: Date.now(),
      status: 'in-progress',
      duration: 0,
      transcript: [],
      source: 'public_link',
    });

    if (insertError) {
      throw ApiError.misconfigured('Failed to register candidate', insertError);
    }

    return NextResponse.json({
      resultId,
      roleId: role.id,
      roleTitle: role.title,
      interviewDuration: role.interview_duration ?? 30,
      interviewMode: role.interview_mode || 'restricted',
      topics: Array.isArray(role.topics) ? role.topics : [],
    });
  } catch (error) {
    return handleApiError(error, '[public-interview:POST]');
  }
}
