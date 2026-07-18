import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';

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

      if (error.message?.includes('only_published_or_archived_programs_can_be_versioned')) {
        return NextResponse.json(
          { error: 'Only published or archived programs can be versioned' },
          { status: 409 }
        );
      }

      if (error.message?.includes('draft_version_already_exists')) {
        return NextResponse.json(
          { error: 'A draft version already exists for this role vacancy' },
          { status: 409 }
        );
      }

      if (error.message?.includes('forbidden')) {
        return NextResponse.json(
          { error: 'Forbidden' },
          { status: 403 }
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
