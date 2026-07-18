import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import { completeTrainingModuleSchema } from '@/lib/training/contracts';

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
      return NextResponse.json(
        { error: rpcError.message || 'Failed to complete module' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      ...(rpcResult as Record<string, unknown>),
    });
  } catch (error: unknown) {
    console.error('[Complete Module API] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
