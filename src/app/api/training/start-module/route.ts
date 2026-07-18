import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

function sessionFromRow(row: any) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    moduleId: row.module_id || undefined,
    sessionType: row.session_type || 'general',
    messages: row.messages || [],
    startedAt: row.started_at,
    endedAt: row.ended_at || undefined,
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Obtener empleado de la sesión segura
    const employee = await getTrainingEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized training session' }, { status: 401 });
    }

    const body = await req.json();
    const { moduleId } = body;

    if (!moduleId) {
      return NextResponse.json({ error: 'moduleId is required' }, { status: 400 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // 2. Cargar el módulo y progreso asignado del empleado
    const { data: moduleData, error: modError } = await admin
      .from('training_modules')
      .select('*')
      .eq('id', moduleId)
      .maybeSingle();

    if (modError || !moduleData) {
      console.error('[Start Module API] Module not found:', modError);
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    // Validar asignación del programa
    if (moduleData.program_id !== employee.program_id) {
      return NextResponse.json({ error: 'Module is not assigned' }, { status: 403 });
    }

    const { data: progressData, error: progError } = await admin
      .from('training_progress')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('module_id', moduleId)
      .maybeSingle();

    if (progError || !progressData) {
      console.error('[Start Module API] Progress query failed:', progError);
      return NextResponse.json({ error: 'Training progress record not found' }, { status: 404 });
    }

    // Si ya está completed, no hacer nada (no cambiarlo a in_progress)
    if (progressData.status === 'completed') {
      // Reanudar la sesión existente o crear una si no existe, pero sin cambiar el progreso
      const { data: existingSession } = await admin
        .from('training_sessions')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('module_id', moduleId)
        .is('ended_at', null)
        .maybeSingle();

      return NextResponse.json({
        success: true,
        session: existingSession ? sessionFromRow(existingSession) : null,
      });
    }

    // Validar bloqueo de progreso
    if (!['available', 'in_progress'].includes(progressData.status)) {
      return NextResponse.json({ error: 'Module is locked' }, { status: 403 });
    }

    // 3. Actualizar progreso del módulo a 'in_progress' y setear started_at
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

    // 5. Crear o reanudar sesión de chat de capacitación
    const { data: existingSession, error: sessFetchError } = await admin
      .from('training_sessions')
      .select('*')
      .eq('employee_id', employee.id)
      .eq('module_id', moduleId)
      .is('ended_at', null)
      .maybeSingle();

    if (sessFetchError) {
      console.error('[Start Module API] Error checking existing session:', sessFetchError);
    }

    let session: any;

    if (existingSession) {
      session = sessionFromRow(existingSession);
    } else {
      const newSessionRow = {
        id: crypto.randomUUID(),
        employee_id: employee.id,
        module_id: moduleId,
        session_type: 'module',
        messages: [],
        started_at: now,
      };

      const { data: createdSession, error: sessInsertError } = await admin
        .from('training_sessions')
        .insert(newSessionRow)
        .select('*')
        .single();

      if (sessInsertError) {
        console.error('[Start Module API] Error inserting training session:', sessInsertError);
        return NextResponse.json({ error: 'Failed to create training session' }, { status: 500 });
      }

      session = sessionFromRow(createdSession);
    }

    return NextResponse.json({
      success: true,
      session,
    });
  } catch (err: any) {
    console.error('[Start Module API] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
