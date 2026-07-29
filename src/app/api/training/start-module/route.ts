import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  startTrainingModuleSchema,
  startTrainingModuleRpcResultSchema,
} from '@/lib/training/contracts';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { resolveTrainingRpcError } from '@/lib/training/rpc-errors';

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

      // El catálogo mantiene 403 para `module_locked`, 404 para los tres
      // identificadores de "no encontrado / no asignado" y 409 para
      // `module_not_available`, y además distingue el texto de cada uno en
      // lugar de responder siempre "Training progress not found"
      // (Requisitos 9.3, 10.4).
      const resolved = resolveTrainingRpcError(rpcError, 'en');

      if (resolved) {
        return NextResponse.json(
          { error: resolved.message },
          { status: resolved.status }
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
