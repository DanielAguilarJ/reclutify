import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const employee = await getTrainingEmployeeFromSession();

    if (!employee) {
      return NextResponse.json(
        { error: 'Training session is not valid' },
        { status: 401 },
      );
    }

    const supabase = createAdminClient();

    const [
      programResult,
      modulesResult,
      progressResult,
    ] = await Promise.all([
      supabase
        .from('training_programs')
        .select('*')
        .eq('id', employee.program_id)
        .eq('org_id', employee.org_id)
        .maybeSingle(),

      supabase
        .from('training_modules')
        .select('*')
        .eq('program_id', employee.program_id)
        .order('sort_order', { ascending: true }),

      supabase
        .from('training_progress')
        .select('*')
        .eq('employee_id', employee.id)
        .order('created_at', { ascending: true }),
    ]);

    if (programResult.error) {
      console.error(
        '[training/bootstrap] Program query failed:',
        programResult.error,
      );

      return NextResponse.json(
        { error: 'Could not load training program' },
        { status: 500 },
      );
    }

    if (!programResult.data) {
      return NextResponse.json(
        { error: 'Training program not found' },
        { status: 404 },
      );
    }

    if (modulesResult.error) {
      console.error(
        '[training/bootstrap] Modules query failed:',
        modulesResult.error,
      );

      return NextResponse.json(
        { error: 'Could not load training modules' },
        { status: 500 },
      );
    }

    if (progressResult.error) {
      console.error(
        '[training/bootstrap] Progress query failed:',
        progressResult.error,
      );

      return NextResponse.json(
        { error: 'Could not load training progress' },
        { status: 500 },
      );
    }

    /*
     * No enviar al navegador:
     * - token real
     * - interview_data completo
     * - transcript de entrevista
     *
     * La personalización será utilizada posteriormente por el endpoint
     * server-side del tutor, no necesita estar expuesta al navegador.
     */
    const safeEmployee = {
      id: employee.id,
      org_id: employee.org_id,
      candidate_result_id: employee.candidate_result_id,
      user_id: employee.user_id,
      program_id: employee.program_id,
      role_id: employee.role_id,
      token: '',
      email: employee.email,
      name: employee.name,
      role_title: employee.role_title,
      status: employee.status,
      overall_progress: employee.overall_progress,
      overall_score: employee.overall_score,
      hired_at: employee.hired_at,
      started_at: employee.started_at,
      completed_at: employee.completed_at,
      interview_data: {},
      personalization_notes: {},
      created_at: employee.created_at,
    };

    return NextResponse.json({
      success: true,
      employee: safeEmployee,
      program: programResult.data,
      modules: modulesResult.data ?? [],
      progress: progressResult.data ?? [],
    });
  } catch (error) {
    console.error('[training/bootstrap] Unexpected error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
