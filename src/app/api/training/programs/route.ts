import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();
    const body = await req.json();
    const { roleId, title, description, welcomeMessage, aiPersonality } = body;

    if (!roleId || !title || !aiPersonality) {
      return NextResponse.json(
        { error: 'roleId, title, and aiPersonality are required' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // 1. Cargar el rol para verificar org_id
    const { data: role, error: roleError } = await admin
      .from('roles')
      .select('org_id')
      .eq('id', roleId)
      .maybeSingle();

    if (roleError || !role) {
      console.error('[Programs API] Role not found:', roleError);
      return NextResponse.json({ error: 'Role vacancy not found' }, { status: 404 });
    }

    const orgId = role.org_id;

    // 2. Verificar que el usuario es owner/admin de esa organización
    const { data: member, error: memberError } = await admin
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin'])
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Rechazar si ya existe un draft para esa vacante
    const { data: existingDraft, error: draftCheckError } = await admin
      .from('training_programs')
      .select('id')
      .eq('org_id', orgId)
      .eq('role_id', roleId)
      .eq('status', 'draft')
      .maybeSingle();

    if (draftCheckError) {
      console.error('[Programs API] Error checking draft:', draftCheckError);
    }

    if (existingDraft) {
      return NextResponse.json(
        { error: 'A draft version of the training program already exists for this role vacancy' },
        { status: 409 }
      );
    }

    // 4. Calcular siguiente versión
    const { data: maxVer } = await admin
      .from('training_programs')
      .select('version')
      .eq('org_id', orgId)
      .eq('role_id', roleId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = maxVer ? (maxVer.version ?? 0) + 1 : 1;

    // 5. Insertar el programa
    const { data: newProgram, error: insertError } = await admin
      .from('training_programs')
      .insert({
        org_id: orgId,
        role_id: roleId,
        title,
        description: description || null,
        is_default: false,
        welcome_message: welcomeMessage || null,
        ai_personality: aiPersonality,
        status: 'draft',
        version: nextVersion,
        passing_score: 70,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('[Programs API] Error inserting program:', insertError);
      return NextResponse.json({ error: 'Failed to create training program' }, { status: 500 });
    }

    // Adaptar campos al formato camelCase esperado por el frontend
    const camelProgram = {
      id: newProgram.id,
      orgId: newProgram.org_id,
      roleId: newProgram.role_id,
      title: newProgram.title,
      description: newProgram.description || undefined,
      isDefault: newProgram.is_default,
      welcomeMessage: newProgram.welcome_message || undefined,
      aiPersonality: newProgram.ai_personality,
      status: newProgram.status,
      version: newProgram.version,
      passingScore: newProgram.passing_score,
      createdAt: newProgram.created_at,
      updatedAt: newProgram.updated_at,
    };

    return NextResponse.json(camelProgram);
  } catch (err: any) {
    console.error('[Programs API] Unexpected failure:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
