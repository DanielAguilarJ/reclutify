import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/utils/supabase/admin';
import { TRAINING_COOKIE_NAME } from '@/lib/training/session';

export const runtime = 'nodejs';

interface AccessRequestBody {
  token?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AccessRequestBody;
    const token = body.token?.trim();

    if (!token) {
      return NextResponse.json(
        { error: 'Training token is required' },
        { status: 400 },
      );
    }

    const supabase = createAdminClient();

    const { data: employee, error } = await supabase
      .from('training_employees')
      .select(
        'id, token, status, access_expires_at, access_revoked_at',
      )
      .eq('token', token)
      .maybeSingle();

    if (error) {
      console.error('[training/access] Employee query failed:', error);

      return NextResponse.json(
        { error: 'Could not validate training access' },
        { status: 500 },
      );
    }

    if (!employee) {
      return NextResponse.json(
        { error: 'Invalid training link' },
        { status: 401 },
      );
    }

    if (employee.access_revoked_at) {
      return NextResponse.json(
        { error: 'This training link has been revoked' },
        { status: 401 },
      );
    }

    if (
      employee.access_expires_at &&
      new Date(employee.access_expires_at).getTime() <= Date.now()
    ) {
      return NextResponse.json(
        { error: 'This training link has expired' },
        { status: 401 },
      );
    }

    const cookieStore = await cookies();

    cookieStore.set(TRAINING_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[training/access] Unexpected error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
