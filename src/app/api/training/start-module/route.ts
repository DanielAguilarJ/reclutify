import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import { startTrainingModuleSchema } from '@/lib/training/contracts';

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
    const now = new Date().toISOString();

    // 2. Verificar que el módulo pertenece al programa del empleado
    const { data: moduleData, error: modError } = await admin
      .from('training_modules')
      .select('id, program_id')
      .eq('id', moduleId)
      .eq('program_id', employee.program_id)
      .maybeSingle();

    if (modError || !moduleData) {
      return NextResponse.json({ error: 'Module not found or not assigned' }, { status: 404 });
    }

    // 3. Verificar y actualizar progreso
    const { data: progressData, error: progError } = await admin
      .from('training_progress')
      .select('id, status')
      .eq('employee_id', employee.id)
      .eq('module_id', moduleId)
      .maybeSingle();

    if (progError || !progressData) {
      console.error('[Start Module API] Progress query failed:', progError);
      return NextResponse.json({ error: 'Training progress record not found' }, { status: 404 });
    }

    // Si ya está completed, no cambiar estado
    if (progressData.status === 'completed') {
      return NextResponse.json({ success: true });
    }

    // Si está bloqueado, rechazar
    if (!['available', 'in_progress'].includes(progressData.status as string)) {
      return NextResponse.json({ error: 'Module is locked' }, { status: 403 });
    }

    // Marcar en progreso
    const { error: updateProgError } = await admin
      .from('training_progress')
      .update({ status: 'in_progress', started_at: now })
      .eq('employee_id', employee.id)
      .eq('module_id', moduleId);

    if (updateProgError) {
      console.error('[Start Module API] Error updating progress status:', updateProgError);
      return NextResponse.json({ error: 'Failed to update progress status' }, { status: 500 });
    }

    // 4. Si el empleado está 'not_started', mover a 'active'
    if (employee.status === 'not_started') {
      const { error: empError } = await admin
        .from('training_employees')
        .update({ status: 'active', started_at: now })
        .eq('id', employee.id);

      if (empError) {
        console.error('[Start Module API] Error updating employee status:', empError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[Start Module API] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
