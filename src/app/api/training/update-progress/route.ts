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
      console.error(
        '[Update Progress API] Time RPC failed:',
        rpcError
      );

      if (
        rpcError.message?.includes(
          'training_progress_not_available'
        )
      ) {
        return NextResponse.json(
          {
            error:
              'Training progress is not available for time updates',
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Could not update training time' },
        { status: 500 }
      );
    }

    if (
      typeof newTimeSpent !== 'number' ||
      !Number.isInteger(newTimeSpent) ||
      newTimeSpent < 0
    ) {
      console.error(
        '[Update Progress API] Invalid RPC result:',
        newTimeSpent
      );

      return NextResponse.json(
        { error: 'Could not update training time' },
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
