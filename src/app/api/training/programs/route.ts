import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { createAdminClient } from '@/utils/supabase/admin';
import { createTrainingProgramSchema } from '@/lib/training/contracts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const parsed = createTrainingProgramSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { roleId, title, description, welcomeMessage, aiPersonality } = parsed.data;

    const admin = createAdminClient();

    // Llamar a la RPC transaccional que maneja concurrencia y versiones
    const { data: programId, error: rpcError } = await admin.rpc(
      'create_training_program',
      {
        p_actor_user_id: user.id,
        p_role_id: roleId,
        p_title: title,
        p_description: description ?? null,
        p_welcome_message: welcomeMessage ?? null,
        p_ai_personality: aiPersonality,
      }
    );

    if (rpcError) {
      console.error('[Programs API] RPC create_training_program failed:', rpcError);

      if (rpcError.message?.includes('role_not_found')) {
        return NextResponse.json({ error: 'Role vacancy not found' }, { status: 404 });
      }
      if (rpcError.message?.includes('forbidden')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (rpcError.message?.includes('draft_version_already_exists')) {
        return NextResponse.json(
          { error: 'A draft version of the training program already exists for this role vacancy' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create training program' },
        { status: 500 }
      );
    }

    // Cargar el programa recién creado
    const { data: newProgram, error: loadError } = await admin
      .from('training_programs')
      .select('*')
      .eq('id', programId as string)
      .single();

    if (loadError || !newProgram) {
      console.error('[Programs API] Failed to load created program:', loadError);
      return NextResponse.json(
        { error: 'Program created but could not be loaded' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: newProgram.id,
      orgId: newProgram.org_id,
      roleId: newProgram.role_id,
      title: newProgram.title,
      description: newProgram.description ?? undefined,
      isDefault: newProgram.is_default,
      welcomeMessage: newProgram.welcome_message ?? undefined,
      aiPersonality: newProgram.ai_personality,
      status: newProgram.status,
      version: newProgram.version,
      passingScore: newProgram.passing_score,
      createdAt: newProgram.created_at,
      updatedAt: newProgram.updated_at,
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[Programs API] Unexpected failure');
  }
}
