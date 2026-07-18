import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import {
  attachTrainingDocumentSchema,
  detachTrainingDocumentQuerySchema,
} from '@/lib/training/contracts';

export const runtime = 'nodejs';

type AttachedDocRow = {
  id: string;
  org_id: string;
  role_id: string | null;
  scope: 'organization' | 'role';
  file_name: string;
  file_type: string;
  file_size: number | null;
  ai_summary: string | null;
  ai_topics: unknown;
  status: 'uploaded' | 'processing' | 'ready' | 'failed' | 'needs_ocr';
  processing_error: string | null;
  created_at: string;
  updated_at: string;
};

function mapDocRow(doc: AttachedDocRow) {
  return {
    id: doc.id,
    orgId: doc.org_id,
    roleId: doc.role_id ?? undefined,
    scope: doc.scope,
    fileName: doc.file_name,
    fileType: doc.file_type,
    fileSize: doc.file_size ?? undefined,
    aiSummary: doc.ai_summary ?? undefined,
    aiTopics: doc.ai_topics ?? [],
    status: doc.status,
    processingError: doc.processing_error ?? undefined,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    // 1. Obtener documentos ya asociados
    const { data: associations, error: assocError } = await admin
      .from('training_program_documents')
      .select(`
        required,
        sort_order,
        training_documents (
          id,
          org_id,
          role_id,
          scope,
          file_name,
          file_type,
          file_size,
          ai_summary,
          ai_topics,
          status,
          processing_error,
          created_at,
          updated_at
        )
      `)
      .eq('program_id', programId)
      .order('sort_order', { ascending: true });

    if (assocError) {
      console.error('[API Program Documents] Error fetching associations:', assocError);
      return NextResponse.json({ error: 'Failed to load associated documents' }, { status: 500 });
    }

    const attached = (associations as unknown as Array<{ training_documents: AttachedDocRow | AttachedDocRow[] | null }> ?? [])
      .map((assoc) => {
        const docRaw = assoc.training_documents;
        const doc = Array.isArray(docRaw) ? docRaw[0] : docRaw;
        if (!doc) return null;
        return mapDocRow(doc);
      })
      .filter((d): d is ReturnType<typeof mapDocRow> => d !== null);

    const attachedIds = new Set(attached.map((d) => d.id));

    // 2. Obtener documentos disponibles (solo ready) que no estén asociados
    let availableQuery = admin
      .from('training_documents')
      .select(`
        id,
        org_id,
        role_id,
        scope,
        file_name,
        file_type,
        file_size,
        ai_summary,
        ai_topics,
        status,
        processing_error,
        created_at,
        updated_at
      `)
      .eq('org_id', program.org_id)
      .eq('status', 'ready');

    if (program.role_id) {
      availableQuery = availableQuery.or(
        `scope.eq.organization,and(scope.eq.role,role_id.eq.${program.role_id})`
      );
    } else {
      availableQuery = availableQuery.eq('scope', 'organization');
    }

    const { data: documents, error: docsError } = await availableQuery;

    if (docsError) {
      console.error('[API Program Documents] Error fetching library documents:', docsError);
      return NextResponse.json({ error: 'Failed to load library documents' }, { status: 500 });
    }

    const available = (documents as AttachedDocRow[] ?? [])
      .filter((doc) => !attachedIds.has(doc.id))
      .map((doc) => mapDocRow(doc));

    return NextResponse.json({
      success: true,
      attached,
      available,
    });
  } catch (err: unknown) {
    console.error('[API Program Documents] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    // Guard: solo programas en draft
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Documents can only be changed in draft programs' },
        { status: 409 }
      );
    }

    const parsed = attachTrainingDocumentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { documentId, required } = parsed.data;

    // 1. Validar que el documento existe, pertenece a la org y está listo
    const { data: document, error: docError } = await admin
      .from('training_documents')
      .select('id, scope, role_id, status')
      .eq('id', documentId)
      .eq('org_id', program.org_id)
      .maybeSingle();

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found or does not belong to this org' },
        { status: 404 }
      );
    }

    // 2. Solo documentos ready pueden asociarse
    if ((document.status as string) !== 'ready') {
      return NextResponse.json(
        { error: 'Only ready documents can be attached to a training program' },
        { status: 409 }
      );
    }

    // 3. Validar que el documento no pertenezca a otra vacante
    if ((document.scope as string) === 'role' && document.role_id !== program.role_id) {
      return NextResponse.json(
        { error: 'Document belongs to another role vacancy' },
        { status: 409 }
      );
    }

    // 4. Obtener el sort_order máximo
    const { data: maxAssoc } = await admin
      .from('training_program_documents')
      .select('sort_order')
      .eq('program_id', programId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = maxAssoc ? ((maxAssoc.sort_order as number) ?? 0) + 1 : 0;

    // 5. Crear la asociación
    const { error: assocError } = await admin
      .from('training_program_documents')
      .upsert(
        {
          program_id: programId,
          document_id: documentId,
          sort_order: nextSortOrder,
          required,
        },
        { onConflict: 'program_id,document_id' }
      );

    if (assocError) {
      console.error('[API Program Documents] Association failed:', assocError);
      return NextResponse.json(
        { error: 'Failed to associate document with program' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API Program Documents] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    // Guard: solo programas en draft
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Documents can only be changed in draft programs' },
        { status: 409 }
      );
    }

    const parsed = detachTrainingDocumentQuerySchema.safeParse({
      documentId: new URL(request.url).searchParams.get('documentId'),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { documentId } = parsed.data;

    const { error: deleteError } = await admin
      .from('training_program_documents')
      .delete()
      .eq('program_id', programId)
      .eq('document_id', documentId);

    if (deleteError) {
      console.error('[API Program Documents] Detach failed:', deleteError);
      return NextResponse.json({ error: 'Failed to detach document' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API Program Documents] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
