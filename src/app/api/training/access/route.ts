import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';
import { TRAINING_COOKIE_NAME } from '@/lib/training/session';
import { hashOpaqueToken, createOpaqueToken } from '@/lib/training/tokens';

export const runtime = 'nodejs';

interface AccessRequestBody {
  token?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AccessRequestBody;
    const invitationToken = body.token?.trim();

    if (!invitationToken) {
      return NextResponse.json(
        { error: 'Training token is required' },
        { status: 400 }
      );
    }

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

    // 2. Generar token de sesión temporal opaco y su hash
    const sessionToken = createOpaqueToken();
    const sessionTokenHash = hashOpaqueToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 días

    // 3. Registrar la sesión temporal en la base de datos
    const { error: sessionError } = await supabase
      .from('training_access_sessions')
      .insert({
        employee_id: employee.id,
        session_token_hash: sessionTokenHash,
        expires_at: sessionExpiresAt,
      });

    if (sessionError) {
      console.error('[training/access] Failed to record access session:', sessionError);
      return NextResponse.json({ error: 'Failed to create training session' }, { status: 500 });
    }

    // 4. Guardar el token de sesión en una cookie HttpOnly segura
    const cookieStore = await cookies();
    cookieStore.set(TRAINING_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[training/access] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
