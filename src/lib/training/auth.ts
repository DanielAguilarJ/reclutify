import 'server-only';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

export class TrainingAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'TrainingAuthError';
  }
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new TrainingAuthError('Authentication required', 401);
  }

  return user;
}

export async function requireOrgAdmin(orgId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();

  const { data: membership, error } = await admin
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (error) {
    console.error('[training/auth] Membership query failed:', error);

    throw new TrainingAuthError(
      'Could not validate organization membership',
      500,
    );
  }

  if (!membership) {
    throw new TrainingAuthError('Forbidden', 403);
  }

  return {
    user,
    membership,
    admin,
  };
}

export async function requireProgramAdmin(programId: string) {
  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();

  const { data: program, error } = await admin
    .from('training_programs')
    .select('*')
    .eq('id', programId)
    .maybeSingle();

  if (error) {
    throw new TrainingAuthError(
      'Could not load training program',
      500,
    );
  }

  if (!program) {
    throw new TrainingAuthError('Training program not found', 404);
  }

  const { data: membership } = await admin
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', program.org_id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (!membership) {
    throw new TrainingAuthError('Forbidden', 403);
  }

  return {
    user,
    membership,
    program,
    admin,
  };
}
