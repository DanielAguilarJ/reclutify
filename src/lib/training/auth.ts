import 'server-only';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { z } from 'zod';

const programIdSchema = z.string().uuid();

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

  if (error) {
    console.error(
      '[training/auth] Authentication query failed:',
      error
    );

    throw new TrainingAuthError(
      'Could not validate authentication',
      500
    );
  }

  if (!user) {
    throw new TrainingAuthError(
      'Authentication required',
      401
    );
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
  const parsedProgramId = programIdSchema.safeParse(programId);

  if (!parsedProgramId.success) {
    throw new TrainingAuthError(
      'Invalid training program ID',
      400
    );
  }

  const validatedProgramId = parsedProgramId.data;

  const user = await requireAuthenticatedUser();
  const admin = createAdminClient();

  const { data: program, error } = await admin
    .from('training_programs')
    .select('*')
    .eq('id', validatedProgramId)
    .maybeSingle();

  if (error) {
    throw new TrainingAuthError(
      'Could not load training program',
      500
    );
  }

  if (!program) {
    throw new TrainingAuthError('Training program not found', 404);
  }

  const {
    data: membership,
    error: membershipError,
  } = await admin
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', program.org_id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (membershipError) {
    console.error(
      '[training/auth] Program membership query failed:',
      membershipError
    );

    throw new TrainingAuthError(
      'Could not validate program permissions',
      500
    );
  }

  if (!membership) {
    throw new TrainingAuthError(
      'Forbidden',
      403
    );
  }

  return {
    user,
    membership,
    program,
    admin,
  };
}
