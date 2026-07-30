import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isCandidateResultOwnedBy,
  validateCandidateResultUpdates,
  PUBLIC_FLOW_AUTH_LOG_PREFIX,
} from '@/lib/candidate-results/authorization';

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
 * ─── Estado de la autorización ──────────────────────────────────────────────
 *
 * Como la service role ignora RLS, esta ruta es el único lugar donde se puede
 * comprobar qué se permite escribir. Hoy hace tres cosas:
 *
 *  1. `org_id` se resuelve SIEMPRE en el servidor a partir del `roleId`, y se
 *     ignora cualquier `orgId` del cuerpo (Requisito 3 criterio 9). Sin esto la
 *     comprobación de pertenencia del `POST` sería trivial de satisfacer:
 *     bastaría enviar el `orgId` del atacante.
 *  2. `POST` comprueba la pertenencia de la fila antes del `upsert`: si el `id`
 *     ya existe y no es del mismo `role_id` + `org_id`, responde 403 y no
 *     escribe (Requisito 3 criterio 5).
 *  3. `PATCH` valida `updates` contra una lista blanca de columnas y rechaza la
 *     petición completa si aparece cualquier otra clave (Requisito 3 criterios
 *     7 y 8). La lista y su derivación están en
 *     `src/lib/candidate-results/authorization.ts`.
 *
 * PENDIENTE — TRAMO SIGUIENTE, NO IMPLEMENTADO AQUÍ: PRUEBA DE ACCESO.
 *
 * Esta ruta TODAVÍA NO exige ninguna credencial que demuestre que quien llama
 * participa en la entrevista que modifica. La prueba de acceso — el `token` del
 * ticket o el `public_token` de la vacante — es el tramo siguiente
 * (Requisito 3 criterios 1, 2, 3 y 6 de
 * `.kiro/specs/public-flow-authorization-hardening/requirements.md`).
 * Hasta que exista, siguen abiertos:
 *
 *  - `PATCH` sobre el `id` de cualquier candidato de cualquier organización,
 *    acotado a las cinco columnas de la lista blanca.
 *  - `POST` con un `id` nuevo cualquiera contra cualquier `roleId` conocido.
 *  - La ventana entre la consulta de pertenencia y el `upsert` del `POST`: la
 *    comprobación no es atómica. La prueba de acceso reduce el problema a quien
 *    ya participa en la entrevista; cerrarla del todo pide una restricción en
 *    la base, fuera del alcance de este tramo.
 *
 * Es decir: este tramo cierra la escalada entre organizaciones, no el acceso
 * anónimo a la ruta.
 * ────────────────────────────────────────────────────────────────────────────
 */

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Registra un rechazo de autorización con un prefijo estable y sin datos
 * sensibles: nunca el nombre ni el correo del candidato, nunca transcripciones.
 */
function logRejection(
  method: 'POST' | 'PATCH',
  reason: string,
  details: Record<string, unknown>,
) {
  console.warn(
    `${PUBLIC_FLOW_AUTH_LOG_PREFIX} candidate-results ${method} rejected: ${reason}`,
    details,
  );
}

// POST: crear o reemplazar (upsert) un resultado de candidato completo.
export async function POST(req: NextRequest) {
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

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('[api/candidate-results][POST] Missing Supabase server env vars');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  // `org_id` se resuelve SIEMPRE desde el rol en el servidor. Antes se aceptaba
  // el `orgId` del cuerpo cuando venía presente; eso permitía declarar una
  // organización arbitraria y, con ella, saltarse la comprobación de
  // pertenencia de más abajo.
  const { data: roleData, error: roleError } = await supabase
    .from('roles')
    .select('org_id')
    .eq('id', roleId)
    .maybeSingle();

  if (roleError) {
    console.warn('[api/candidate-results][POST] role lookup failed:', roleError.message);
  }

  const orgId = (roleData?.org_id as string | null | undefined) || null;

  if (!orgId) {
    return NextResponse.json(
      { error: `Unable to resolve org_id for roleId ${roleId}` },
      { status: 422 }
    );
  }

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
    logRejection('POST', 'existing row belongs to another interview', {
      resultId: id,
      requestedRoleId: roleId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
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
}

// PATCH: actualizar parcialmente un resultado de candidato existente por id.
export async function PATCH(req: NextRequest) {
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

  // La lista blanca se valida ANTES de construir el cliente y antes de
  // cualquier consulta: un rechazo garantiza cero escrituras.
  const validation = validateCandidateResultUpdates(body.updates);
  if (!validation.ok) {
    logRejection('PATCH', validation.reason, {
      resultId: id,
      rejectedKeys: validation.rejectedKeys,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    });
    return NextResponse.json(
      { error: validation.message, rejectedKeys: validation.rejectedKeys },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('[api/candidate-results][PATCH] Missing Supabase server env vars');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
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
}
