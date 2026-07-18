import 'server-only';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';
import { hashOpaqueToken } from './tokens';

export const TRAINING_COOKIE_NAME = 'reclutify_training_access';

export interface TrainingSessionEmployee {
  id: string;
  org_id: string;
  role_id: string | null;
  candidate_result_id: string | null;
  user_id: string | null;
  program_id: string;
  token?: string; // Token original obsoleto
  email: string;
  name: string;
  role_title: string | null;
  status: 'active' | 'completed' | 'paused' | 'not_started';
  overall_progress: number;
  overall_score: number | null;
  hired_at: string;
  started_at: string | null;
  completed_at: string | null;
  interview_data: Record<string, unknown>;
  personalization_notes: Record<string, unknown>;
  access_expires_at: string | null;
  access_revoked_at: string | null;
  created_at: string;
}

/**
 * Obtiene el empleado asociado con la cookie HttpOnly de sesión temporal.
 *
 * Valida la sesión en training_access_sessions y carga el empleado de training_employees.
 */
export async function getTrainingEmployeeFromSession(): Promise<TrainingSessionEmployee | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(TRAINING_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return null;
    }

    const sessionTokenHash = hashOpaqueToken(sessionToken);
    const supabase = createAdminClient();

    // 1. Validar la sesión temporal
    const { data: session, error: sessionError } = await supabase
      .from('training_access_sessions')
      .select('*')
      .eq('session_token_hash', sessionTokenHash)
      .gt('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .maybeSingle();

    if (sessionError || !session) {
      return null;
    }

    // 2. Cargar el empleado asociado
    const { data: employeeData, error: empError } = await supabase
      .from('training_employees')
      .select('*')
      .eq('id', session.employee_id)
      .maybeSingle();

    if (empError || !employeeData) {
      return null;
    }

    const employee = employeeData as TrainingSessionEmployee;

    // 3. Validar revocación o expiración del acceso general del empleado
    if (employee.access_revoked_at) {
      return null;
    }

    if (
      employee.access_expires_at &&
      new Date(employee.access_expires_at).getTime() <= Date.now()
    ) {
      return null;
    }

    // 4. Actualizar la última vez visto (last_seen_at) de la sesión
    const { error: lastSeenError } = await supabase
      .from('training_access_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', session.id);

    if (lastSeenError) {
      console.error('[Session Helper] Error updating last_seen_at:', lastSeenError);
    }

    return employee;
  } catch (err) {
    console.error('[Session Helper] Error loading employee session:', err);
    return null;
  }
}
