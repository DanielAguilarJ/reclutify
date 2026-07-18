import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;

    // 1. Autenticar usuario
    const user = await requireAuthenticatedUser();
    const admin = createAdminClient();

    // 2. Invocar RPC para publicación atómica
    const { data: publishedId, error } = await admin.rpc(
      'publish_training_program',
      {
        p_actor_user_id: user.id,
        p_program_id: programId,
      }
    );

    if (error) {
      console.error('[API Program Publish] RPC failed:', error);
      return NextResponse.json({ error: error.message || 'Failed to publish training program' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      programId: publishedId,
    });
  } catch (err: any) {
    console.error('[API Program Publish] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}
