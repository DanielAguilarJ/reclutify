import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  requireAuthenticatedUser,
  TrainingAuthError,
} from '@/lib/training/auth';
import { createAdminClient } from '@/utils/supabase/admin';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ documentId: string }> }
) {
  try {
    const user = await requireAuthenticatedUser();
    const { documentId } = await context.params;

    const documentIdResult = z.string().uuid().safeParse(documentId);

    if (!documentIdResult.success) {
      return NextResponse.json(
        { error: 'Invalid document ID' },
        { status: 400 }
      );
    }

    const validatedDocumentId = documentIdResult.data;

    const admin = createAdminClient();

    const { data: document, error: documentError } = await admin
      .from('training_documents')
      .select('id, org_id, storage_path, file_name')
      .eq('id', validatedDocumentId)
      .maybeSingle();

    if (documentError) {
      console.error(
        '[Training Download] Document query failed:',
        documentError
      );

      return NextResponse.json(
        { error: 'Could not load document' },
        { status: 500 }
      );
    }

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    // Verificar membresía como owner/admin de la org
    const {
      data: membership,
      error: membershipError,
    } = await admin
      .from('org_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', document.org_id)
      .in('role', ['owner', 'admin'])
      .maybeSingle();

    if (membershipError) {
      console.error(
        '[Training Download] Membership query failed:',
        membershipError
      );

      return NextResponse.json(
        { error: 'Could not validate permissions' },
        { status: 500 }
      );
    }

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
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
      console.error(
        '[Training Download] Signed URL creation failed:',
        signedUrlError
      );

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
    console.error(
      '[Training Download] Unexpected error:',
      error
    );

    if (error instanceof TrainingAuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
