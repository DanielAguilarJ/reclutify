import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { documentId } = await context.params;

    const admin = createAdminClient();

    const { data: document, error: documentError } = await admin
      .from('training_documents')
      .select('id, org_id, storage_path, file_name')
      .eq('id', documentId)
      .maybeSingle();

    if (documentError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Verificar membresía como owner/admin de la org
    const { data: membership } = await admin
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', document.org_id)
      .in('role', ['owner', 'admin'])
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!document.storage_path) {
      return NextResponse.json(
        { error: 'Document file is unavailable' },
        { status: 404 }
      );
    }

    const { data: signedUrl, error: signedUrlError } = await admin.storage
      .from('training-documents')
      .createSignedUrl(document.storage_path, 60, {
        download: document.file_name,
      });

    if (signedUrlError || !signedUrl) {
      return NextResponse.json(
        { error: 'Could not create download URL' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: signedUrl.signedUrl,
      expiresIn: 60,
    });
  } catch (error: unknown) {
    console.error('[Training Download] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
