import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';
import { trainingApiErrorResponse } from '@/lib/training/http';

export const runtime = 'nodejs';

export async function POST(
  _request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;

    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();

    const { data: publishedId, error } = await admin.rpc(
      'publish_training_program',
      {
        p_actor_user_id: user.id,
        p_program_id: programId,
      }
    );

    if (error) {
      console.error('[API Program Publish] RPC failed:', error);

      if (error.message?.includes('only_draft_programs_can_be_published')) {
        return NextResponse.json(
          { error: 'Only draft programs can be published' },
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
