import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  startTrainingModuleSchema,
  startTrainingModuleRpcResultSchema,
} from '@/lib/training/contracts';
import { trainingApiErrorResponse } from '@/lib/training/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. Obtener empleado de la sesión segura
    const employee = await getTrainingEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized training session' }, { status: 401 });
    }

    const parsed = startTrainingModuleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { moduleId } = parsed.data;
    const admin = createAdminClient();

    // 2. Llamar a la RPC transaccional start_training_module
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      'start_training_module',
      {
        p_employee_id: employee.id,
        p_module_id: moduleId,
      }
    );

    if (rpcError) {
      console.error('[Start Module API] Start RPC failed:', rpcError);

      if (rpcError.message?.includes('module_locked')) {
        return NextResponse.json(
          { error: 'Module is locked' },
          { status: 403 }
        );
      }

      if (
        rpcError.message?.includes('training_progress_not_found') ||
        rpcError.message?.includes('training_module_not_found') ||
        rpcError.message?.includes('module_not_assigned')
      ) {
        return NextResponse.json(
          { error: 'Training progress not found' },
          { status: 404 }
        );
      }

      if (rpcError.message?.includes('module_not_available')) {
        return NextResponse.json(
          { error: 'Module is not available' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Could not start training module' },
        { status: 500 }
      );
    }

    const resultValidation =
      startTrainingModuleRpcResultSchema.safeParse(
        rpcResult
      );

    if (!resultValidation.success) {
      console.error(
        '[Start Module API] Invalid RPC result:',
        resultValidation.error.flatten()
      );

      return NextResponse.json(
        { error: 'Could not start training module' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      result: resultValidation.data,
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(
      err,
      '[Start Module API] Unexpected failure'
    );
  }
}
