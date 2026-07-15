import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API: Validar public_token y retornar datos del rol para entrevista pública.
 * No requiere autenticación — es para candidatos que reciben un enlace general.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json(
      { error: 'Token is required' },
      { status: 400 }
    );
  }

  // Usar service role para bypass de RLS (lectura de rol por public_token)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Buscar rol por public_token
  const { data: role, error } = await supabase
    .from('roles')
    .select('id, title, description, location, salary, job_type, interview_duration, interview_mode, topics, org_id')
    .eq('public_token', token)
    .single();

  if (error || !role) {
    return NextResponse.json(
      { error: 'Invalid or expired link' },
      { status: 404 }
    );
  }

  // Obtener info de la organización para branding
  let orgName = '';
  let orgPlanTier = 'starter';
  if (role.org_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, plan_tier')
      .eq('id', role.org_id)
      .single();
    if (org) {
      orgName = org.name || '';
      orgPlanTier = org.plan_tier || 'starter';
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
      topics: role.topics || [],
      orgId: role.org_id,
    },
    org: {
      name: orgName,
      planTier: orgPlanTier,
    },
  });
}

/**
 * POST: Registrar candidato desde enlace público y crear resultado independiente.
 * Cada candidato que usa el enlace general obtiene su propia entrada.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, candidateName, candidateEmail, candidatePhone, linkedinUrl } = body;

  if (!token || !candidateName || !candidateEmail) {
    return NextResponse.json(
      { error: 'Token, name and email are required' },
      { status: 400 }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Validar token y obtener rol
  const { data: role, error: roleError } = await supabase
    .from('roles')
    .select('id, title, org_id, interview_duration, interview_mode, topics')
    .eq('public_token', token)
    .single();

  if (roleError || !role) {
    return NextResponse.json(
      { error: 'Invalid link' },
      { status: 404 }
    );
  }

  // Crear entrada de resultado de candidato independiente
  const resultId = `cr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  const { error: insertError } = await supabase
    .from('candidate_results')
    .insert({
      id: resultId,
      org_id: role.org_id,
      candidate_name: candidateName,
      candidate_email: candidateEmail,
      candidate_phone: candidatePhone || '',
      candidate_linkedin: linkedinUrl || '',
      role_id: role.id,
      role_title: role.title,
      date: Date.now(),
      status: 'in-progress',
      duration: 0,
      transcript: [],
      source: 'public_link',
    });

  if (insertError) {
    console.error('Error creating candidate result:', insertError);
    return NextResponse.json(
      { error: 'Failed to register candidate' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    resultId,
    roleId: role.id,
    roleTitle: role.title,
    interviewDuration: role.interview_duration ?? 30,
    interviewMode: role.interview_mode || 'restricted',
    topics: role.topics || [],
  });
}
