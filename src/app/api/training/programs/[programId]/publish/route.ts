import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { resolveTrainingRpcError } from '@/lib/training/rpc-errors';

export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;

    const { user, admin } = await requireProgramAdmin(programId);

    const { data: publishedId, error } = await admin.rpc(
      'publish_training_program',
      {
        p_actor_user_id: user.id,
        p_program_id: programId,
      }
    );

    if (error) {
      console.error('[API Program Publish] RPC failed:', error);

      // El catálogo cubre `only_draft_programs_can_be_published`, `forbidden`,
      // `training_program_not_found`, `training_program_has_no_role`,
      // `training_program_has_no_modules` y
      // `training_program_has_unready_documents` con el mismo status y texto
      // que esta ruta devolvía de forma manual (Requisitos 6.1, 6.3).
      const resolved = resolveTrainingRpcError(error, 'en');

      if (resolved) {
        return NextResponse.json(
          { error: resolved.message },
          { status: resolved.status }
        );
      }

      return NextResponse.json(
        { error: 'Failed to publish training program' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      programId: publishedId as string,
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[API Program Publish] Unexpected error');
  }
}
