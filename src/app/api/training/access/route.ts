import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';
import { TRAINING_COOKIE_NAME } from '@/lib/training/session';
import { hashOpaqueToken, createOpaqueToken } from '@/lib/training/tokens';
import { trainingAccessSchema } from '@/lib/training/contracts';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const parsed = trainingAccessSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid training token' },
        { status: 400 }
      );
    }

    const invitationToken = parsed.data.token;
    const invitationTokenHash = hashOpaqueToken(invitationToken);
    const supabase = createAdminClient();

    // 1. Buscar empleado por el hash del token de invitación
    const { data: employee, error } = await supabase
      .from('training_employees')
      .select('id, access_expires_at, access_revoked_at')
      .eq('access_token_hash', invitationTokenHash)
      .maybeSingle();

    if (error) {
      console.error('[training/access] Employee query failed:', error);
      return NextResponse.json({ error: 'Could not validate training access' }, { status: 500 });
    }

    if (!employee) {
      return NextResponse.json({ error: 'Invalid training link' }, { status: 401 });
    }

    if (employee.access_revoked_at) {
      return NextResponse.json({ error: 'This training link has been revoked' }, { status: 401 });
    }

    if (
      employee.access_expires_at &&
      new Date(employee.access_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json({ error: 'This training link has expired' }, { status: 401 });
    }

    // 2. Revocar sesiones activas anteriores
    const { error: revokeError } = await supabase
      .from('training_access_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('employee_id', employee.id)
      .is('revoked_at', null);

    if (revokeError) {
      console.error('[training/access] Failed to revoke previous sessions:', revokeError);
      // No es bloqueante: continuar
    }

    // 3. Generar token de sesión temporal opaco y su hash
    const sessionToken = createOpaqueToken();
    const sessionTokenHash = hashOpaqueToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // 4. Registrar la sesión temporal en la base de datos
    const { error: sessionError } = await supabase
      .from('training_access_sessions')
      .insert({
        employee_id: employee.id,
        session_token_hash: sessionTokenHash,
        expires_at: sessionExpiresAt,
      });

    if (sessionError) {
      if (sessionError.code === '23505') {
        // Colisión en el índice único: revocar y reintentar
        await supabase
          .from('training_access_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('employee_id', employee.id)
          .is('revoked_at', null);

        const { error: retryError } = await supabase
          .from('training_access_sessions')
          .insert({
            employee_id: employee.id,
            session_token_hash: sessionTokenHash,
            expires_at: sessionExpiresAt,
          });

        if (retryError) {
          console.error('[training/access] Failed to create session on retry:', retryError);
          return NextResponse.json({ error: 'Failed to create training session' }, { status: 500 });
        }
      } else {
        console.error('[training/access] Failed to record access session:', sessionError);
        return NextResponse.json({ error: 'Failed to create training session' }, { status: 500 });
      }
    }

    // 5. Guardar el token de sesión en una cookie HttpOnly segura
    const cookieStore = await cookies();
    cookieStore.set(TRAINING_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('[training/access] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
