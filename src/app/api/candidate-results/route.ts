import { NextRequest, NextResponse } from 'next/server';

import {
  authorizeCredentialForRole,
  requireCandidateResultCredential,
  type CandidateResultAccessGrant,
  type CandidateResultCredential,
} from '@/lib/candidate-results/access-proof';
import { parseCandidateResultAccessProof } from '@/lib/candidate-results/access-proof-contracts';
import {
  isCandidateResultOwnedBy,
  validateCandidateResultUpdates,
  PUBLIC_FLOW_AUTH_LOG_PREFIX,
} from '@/lib/candidate-results/authorization';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * API: Crear/actualizar (upsert) o parchear filas de `candidate_results`
 * usando la SERVICE ROLE KEY del servidor.
 *
 * Por qué existe esta ruta:
 * Los candidatos que toman una entrevista (tanto por "ticket" individual
 * como por enlace público) NUNCA tienen una sesión autenticada de Supabase.
 * Antes, el store de admin escribía directo a `candidate_results` desde el
 * navegador usando la ANON key, lo cual depende 100% de que las políticas
 * RLS de `anon` estén correctamente desplegadas en la base de datos real.
 * Cualquier desalineación entre las migraciones del repo y la base de datos
 * en producción (migración no aplicada, política borrada manualmente, etc.)
 * provoca el error 401 / 42501 "new row violates row-level security policy".
 *
 * Al mover la escritura a esta ruta server-side (que usa la service role,
 * la cual **bypassa RLS** por diseño) eliminamos esa dependencia frágil:
 * la escritura del resultado de la entrevista SIEMPRE funciona sin importar
 * el estado de las políticas RLS de `anon`.
 *
 * ─── Autorización ───────────────────────────────────────────────────────────
 *
 * Como la service role ignora RLS, esta ruta es el único lugar donde se puede
 * comprobar qué se permite escribir. Hace cuatro cosas, en este orden:
 *
 *  1. PRUEBA DE ACCESO: exige una credencial que demuestre que quien escribe
 *     participa en la entrevista. Es lo primero, antes de leer
 *     `candidate_results`, así que una petición sin credencial se va con `401`
 *     sin haber tocado la tabla. Las tres credenciales aceptadas y el reparto de
 *     códigos están en `src/lib/candidate-results/access-proof.ts`; el detalle
 *     que importa para el flujo real es que un ticket ya consumido SÍ acredita
 *     (se quema al entrar a la sala, así que todas las escrituras posteriores
 *     llegan con `used = true`) pero uno vencido no.
 *  2. `org_id` se resuelve SIEMPRE en el servidor a partir del `roleId` que
 *     acredita la credencial, y se ignora cualquier `orgId` del cuerpo. Sin esto
 *     la comprobación de pertenencia sería trivial de satisfacer: bastaría enviar
 *     el `orgId` del atacante.
 *  3. PERTENENCIA DE LA FILA: el `POST` no acepta pisar un `id` existente que no
 *     sea del mismo `role_id` + `org_id`, y el `PATCH` exige que la fila que va a
 *     modificar sea del rol y de la organización que acredita la credencial. Sin
 *     eso, una credencial legítima de una entrevista serviría para reescribir la
 *     evaluación de cualquier otra.
 *  4. LISTA BLANCA DE COLUMNAS del `PATCH`: se rechaza la petición completa si
 *     aparece cualquier clave fuera de las cinco que el flujo del candidato
 *     escribe de verdad (`src/lib/candidate-results/authorization.ts`).
 *
 * Ningún rechazo escribe: los cuatro se deciden antes del `upsert`/`update`.
 *
 * LO QUE SIGUE ABIERTO Y NO SE CIERRA AQUÍ: la ventana entre la consulta de
 * pertenencia y el `upsert` del `POST` no es atómica. La prueba de acceso reduce
 * el problema a quien ya participa en la entrevista; cerrarla del todo pide una
 * restricción en la base de datos, fuera del alcance de este tramo.
 * ────────────────────────────────────────────────────────────────────────────
 */

/**
 * Registra un rechazo de autorización con un prefijo estable y sin datos
 * sensibles: nunca el nombre ni el correo del candidato, nunca transcripciones,
 * nunca el valor de una credencial.
 */
function logRejection(
  req: NextRequest,
  method: 'POST' | 'PATCH',
  reason: string,
  details: Record<string, unknown> = {},
) {
  console.warn(
    `${PUBLIC_FLOW_AUTH_LOG_PREFIX} candidate-results ${method} rejected: ${reason}`,
    {
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      ...details,
    },
  );
}

/**
 * Comprueba la prueba de acceso contra una vacante concreta.
 *
 * Devuelve la concesión o una respuesta ya lista: las dos operaciones comparten
 * el mismo reparto de códigos y el mismo formato de log.
 */
async function authorizeForRole(
  req: NextRequest,
  method: 'POST' | 'PATCH',
  credential: CandidateResultCredential,
  roleId: string,
  logDetails: Record<string, unknown>,
): Promise<CandidateResultAccessGrant | NextResponse> {
  const access = await authorizeCredentialForRole(credential, roleId);

  if (!access.ok) {
    logRejection(req, method, access.reason, { ...logDetails, via: credential.kind });
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  return access;
}

// POST: crear o reemplazar (upsert) un resultado de candidato completo.
export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const id = body.id as string | undefined;
    const roleId = body.roleId as string | undefined;

    if (!id || !roleId) {
      return NextResponse.json({ error: 'id and roleId are required' }, { status: 400 });
    }

    const proof = parseCandidateResultAccessProof(body);
    if (!proof.ok) {
      logRejection(req, 'POST', proof.reason, { resultId: id, requestedRoleId: roleId });
      return NextResponse.json({ error: proof.message }, { status: 400 });
    }

    // Prueba de acceso primero: un anónimo no llega ni a leer la tabla.
    const credential = await requireCandidateResultCredential(proof.proof);
    if (!credential.ok) {
      logRejection(req, 'POST', credential.reason, {
        resultId: id,
        requestedRoleId: roleId,
      });
      return NextResponse.json(
        { error: credential.message },
        { status: credential.status },
      );
    }

    const access = await authorizeForRole(
      req,
      'POST',
      credential.credential,
      roleId,
      { resultId: id, requestedRoleId: roleId },
    );
    if (access instanceof NextResponse) return access;

    const { orgId } = access;
    const supabase = createAdminClient();

    // Pertenencia: el `id` lo elige el cliente, así que un `upsert` a secas sirve
    // para pisar la fila de otra entrevista. Si el `id` ya existe, solo se acepta
    // cuando la fila es del mismo rol y de la misma organización.
    const { data: existing, error: existingError } = await supabase
      .from('candidate_results')
      .select('role_id, org_id')
      .eq('id', id)
      .maybeSingle();

    if (existingError) {
      console.error('[api/candidate-results][POST] ownership lookup failed:', existingError);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    if (
      existing &&
      !isCandidateResultOwnedBy(
        {
          role_id: (existing.role_id as string | null) ?? null,
          org_id: (existing.org_id as string | null) ?? null,
        },
        { roleId, orgId },
      )
    ) {
      logRejection(req, 'POST', 'existing row belongs to another interview', {
        resultId: id,
        requestedRoleId: roleId,
        via: access.via,
      });
      // Mensaje genérico: no se filtra a qué rol ni a qué organización pertenece.
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const row = {
      id,
      org_id: orgId,
      candidate_name: (body.candidateName as string) || '',
      candidate_email: (body.candidateEmail as string) || '',
      candidate_phone: (body.candidatePhone as string) || '',
      candidate_linkedin: (body.candidateLinkedin as string) || '',
      role_id: roleId,
      role_title: (body.roleTitle as string) || '',
      date: (body.date as number) || Date.now(),
      status: (body.status as string) || 'in-progress',
      duration: (body.duration as number) || 0,
      video_url: (body.videoUrl as string) || null,
      evaluation: body.evaluation ?? null,
      transcript: body.transcript ?? [],
      source: (body.source as string) === 'public_link' ? 'public_link' : 'ticket',
    };

    const { error } = await supabase.from('candidate_results').upsert(row);

    if (error) {
      console.error('[api/candidate-results][POST] upsert failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, orgId });
  } catch (err) {
    // La causa técnica se queda en el log del servidor: el mensaje de una
    // excepción puede llevar detalle de configuración o de la base de datos.
    console.error('[api/candidate-results][POST] failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// PATCH: actualizar parcialmente un resultado de candidato existente por id.
export async function PATCH(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const id = body.id as string | undefined;

    if (!id || body.updates === undefined || body.updates === null) {
      return NextResponse.json({ error: 'id and updates are required' }, { status: 400 });
    }

    const proof = parseCandidateResultAccessProof(body);
    if (!proof.ok) {
      logRejection(req, 'PATCH', proof.reason, { resultId: id });
      return NextResponse.json({ error: proof.message }, { status: 400 });
    }

    // Prueba de acceso antes de cualquier consulta: sin credencial no se lee ni
    // la fila que se pretendía modificar.
    const credential = await requireCandidateResultCredential(proof.proof);
    if (!credential.ok) {
      logRejection(req, 'PATCH', credential.reason, { resultId: id });
      return NextResponse.json(
        { error: credential.message },
        { status: credential.status },
      );
    }

    // La lista blanca es pura y no toca la base: se valida antes de leer la fila
    // para no gastar consultas en un cuerpo que ya está rechazado.
    const validation = validateCandidateResultUpdates(body.updates);
    if (!validation.ok) {
      logRejection(req, 'PATCH', validation.reason, {
        resultId: id,
        rejectedKeys: validation.rejectedKeys,
      });
      return NextResponse.json(
        { error: validation.message, rejectedKeys: validation.rejectedKeys },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: target, error: targetError } = await supabase
      .from('candidate_results')
      .select('role_id, org_id')
      .eq('id', id)
      .maybeSingle();

    if (targetError) {
      console.error('[api/candidate-results][PATCH] target lookup failed:', targetError);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }

    // La fila no existe: no hay nada que autorizar ni que escribir. Antes el
    // `UPDATE` alcanzaba cero filas y respondía `200`, así que el cliente creía
    // que había guardado. El `404` es honesto y además hace que
    // `patchCandidateResult` reintente, que es lo correcto cuando el `POST` que
    // crea la fila todavía va en camino.
    if (!target) {
      logRejection(req, 'PATCH', 'target row does not exist', { resultId: id });
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const targetRoleId = typeof target.role_id === 'string' ? target.role_id : '';
    const targetOrgId = typeof target.org_id === 'string' ? target.org_id : '';

    // Fila sin rol: ninguna credencial puede acreditarla, así que no se toca.
    if (targetRoleId.length === 0) {
      logRejection(req, 'PATCH', 'target row has no role', { resultId: id });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // La credencial se comprueba contra el rol DE LA FILA, no contra uno que
    // venga en el cuerpo: así un token válido de otra entrevista no sirve.
    const access = await authorizeForRole(req, 'PATCH', credential.credential, targetRoleId, {
      resultId: id,
    });
    if (access instanceof NextResponse) return access;

    // Cinturón y tirantes: la organización de la fila tiene que ser la misma que
    // la de la vacante acreditada. Solo difieren si `candidate_results.org_id`
    // dejó de coincidir con `roles.org_id`, y en ese caso no se escribe.
    if (
      !isCandidateResultOwnedBy(
        { role_id: targetRoleId, org_id: targetOrgId.length > 0 ? targetOrgId : null },
        { roleId: access.roleId, orgId: access.orgId },
      )
    ) {
      logRejection(req, 'PATCH', 'target row belongs to another organization', {
        resultId: id,
        via: access.via,
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('candidate_results')
      .update(validation.updates)
      .eq('id', id);

    if (error) {
      console.error('[api/candidate-results][PATCH] update failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/candidate-results][PATCH] failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
