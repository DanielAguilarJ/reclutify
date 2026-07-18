import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  completeTrainingModuleSchema,
  completeTrainingModuleRpcResultSchema,
} from '@/lib/training/contracts';
import { trainingApiErrorResponse } from '@/lib/training/http';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // 1. Validar sesión del empleado
    const employee = await getTrainingEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized training session' }, { status: 401 });
    }

    const parsed = completeTrainingModuleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { moduleId } = parsed.data;
    const admin = createAdminClient();

    // 2. Invocar RPC para completar módulo sin evaluación de manera transaccional
    const { data: rpcResult, error: rpcError } = await admin.rpc(
      'complete_training_module_without_evaluation',
      {
        p_employee_id: employee.id,
        p_module_id: moduleId,
      }
    );

    if (rpcError) {
      console.error('[Complete Module API] SQL RPC failed:', rpcError);
      
      if (rpcError.message?.includes('module_not_available_for_completion')) {
        return NextResponse.json(
          { error: 'Module not available for completion' },
          { status: 409 }
        );
      }
      if (rpcError.message?.includes('module_does_require_evaluation')) {
        return NextResponse.json(
          { error: 'Module requires evaluation and cannot be completed directly' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to complete module' },
        { status: 500 }
      );
    }

    const parsedRpcResult = completeTrainingModuleRpcResultSchema.safeParse(rpcResult);
    if (!parsedRpcResult.success) {
      console.error('[Complete Module API] RPC response failed Zod validation:', parsedRpcResult.error.flatten());
      return NextResponse.json(
        { error: 'Database response validation failed' },
        { status: 500 }
      );
    }

    const result = parsedRpcResult.data;

    return NextResponse.json({
      success: true,
      overallProgress: result.overallProgress,
      overallScore: result.overallScore,
      nextModuleId: result.nextModuleId,
    });
  } catch (error: unknown) {
    return trainingApiErrorResponse(error, '[Complete Module API] Unexpected error');
  }
}
