import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
 * Seguridad: no requiere sesión porque los candidatos son anónimos por
 * naturaleza, pero SIEMPRE resolvemos `org_id` server-side a partir del
 * `roleId` (nunca confiamos en un `orgId` arbitrario del cliente), igual
 * que ya hace `/api/public-interview`.
 */

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey);
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

  // Siempre resolvemos org_id desde el rol en el servidor — nunca confiamos
  // ciegamente en un valor enviado por el cliente.
  let orgId = (body.orgId as string | null | undefined) || null;
  if (!orgId) {
    const { data: roleData, error: roleError } = await supabase
      .from('roles')
      .select('org_id')
      .eq('id', roleId)
      .single();
    if (roleError) {
      console.warn('[api/candidate-results][POST] role lookup failed:', roleError.message);
    }
    orgId = roleData?.org_id || null;
  }

  if (!orgId) {
    return NextResponse.json(
      { error: `Unable to resolve org_id for roleId ${roleId}` },
      { status: 422 }
    );
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
  const updates = body.updates as Record<string, unknown> | undefined;

  if (!id || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return NextResponse.json({ error: 'id and updates are required' }, { status: 400 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    console.error('[api/candidate-results][PATCH] Missing Supabase server env vars');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { error } = await supabase.from('candidate_results').update(updates).eq('id', id);

  if (error) {
    console.error('[api/candidate-results][PATCH] update failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
