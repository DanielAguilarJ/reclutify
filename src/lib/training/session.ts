import 'server-only';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';

export const TRAINING_COOKIE_NAME = 'reclutify_training_access';

export interface TrainingSessionEmployee {
  id: string;
  org_id: string;
  role_id: string | null;
  candidate_result_id: string | null;
  user_id: string | null;
  program_id: string;
  token: string;
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
 * Obtiene el empleado asociado con la cookie HttpOnly.
 *
 * La consulta usa service role porque el empleado que abre el enlace
 * no necesariamente tiene una cuenta de Supabase.
 */
export async function getTrainingEmployeeFromSession(): Promise<TrainingSessionEmployee | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRAINING_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('training_employees')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const employee = data as TrainingSessionEmployee;

  if (employee.access_revoked_at) {
    return null;
  }

  if (
    employee.access_expires_at &&
    new Date(employee.access_expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  return employee;
}
