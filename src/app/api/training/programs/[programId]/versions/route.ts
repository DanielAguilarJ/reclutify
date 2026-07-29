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

    const { data: newProgramId, error } = await admin.rpc(
      'create_training_program_version',
      {
        p_actor_user_id: user.id,
        p_source_program_id: programId,
      }
    );

    if (error) {
      console.error('[API Program Versions] RPC failed:', error);

      // `only_published_or_archived_programs_can_be_versioned`,
      // `draft_version_already_exists` y `forbidden` viven en el catálogo con
      // el mismo status y texto que esta ruta devolvía (Requisito 6.4).
      const resolved = resolveTrainingRpcError(error, 'en');

      if (resolved) {
        return NextResponse.json(
          { error: resolved.message },
          { status: resolved.status }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create new program version' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      programId: newProgramId as string,
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[API Program Versions] Unexpected error');
  }
}
