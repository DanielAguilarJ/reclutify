import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import { updateTrainingTimeSchema } from '@/lib/training/contracts';
import { trainingApiErrorResponse } from '@/lib/training/http';

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
      
      if (rpcError.message?.includes('module_progress_not_found')) {
        return NextResponse.json(
          { error: 'Module progress record not found' },
          { status: 404 }
        );
      }
      if (rpcError.message?.includes('module_is_locked')) {
        return NextResponse.json(
          { error: 'Module is locked' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update progress time' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      timeSpent: newTimeSpent,
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[Update Progress API] Unexpected error');
  }
}
