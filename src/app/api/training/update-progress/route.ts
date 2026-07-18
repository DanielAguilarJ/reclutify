import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import { updateTrainingTimeSchema } from '@/lib/training/contracts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const employee = await getTrainingEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized training session' }, { status: 401 });
    }

    const parsed = updateTrainingTimeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { moduleId, minutesDelta } = parsed.data;
    const admin = createAdminClient();

    // Invocar RPC atómico increment_training_time
    const { data: newTimeSpent, error: rpcError } = await admin.rpc(
      'increment_training_time',
      {
        p_employee_id: employee.id,
        p_module_id: moduleId,
        p_minutes_delta: minutesDelta,
      }
    );

    if (rpcError) {
      console.error('[Update Progress API] RPC increment failed:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to update progress time' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      timeSpent: newTimeSpent,
    });
  } catch (err: any) {
    console.error('[Update Progress API] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
