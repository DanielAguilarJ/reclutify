import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
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
        training_documents (*)
      `)
      .eq('program_id', programId)
      .order('sort_order', { ascending: true });

    if (assocError) {
      console.error('[API Program Documents] Error fetching associations:', assocError);
      return NextResponse.json({ error: 'Failed to load associated documents' }, { status: 500 });
    }

    const attached = (associations || [])
      .map((assoc: any) => {
        const doc = assoc.training_documents;
        if (!doc) return null;
        return {
          id: doc.id,
          orgId: doc.org_id,
          roleId: doc.role_id || undefined,
          scope: doc.scope,
          fileName: doc.file_name,
          fileType: doc.file_type,
          fileSize: doc.file_size || undefined,
          storagePath: doc.storage_path || undefined,
          extractedText: doc.extracted_text || undefined,
          aiSummary: doc.ai_summary || undefined,
          aiTopics: doc.ai_topics || [],
          status: doc.status,
          processingError: doc.processing_error || undefined,
          checksumSha256: doc.checksum_sha256 || undefined,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at,
        };
      })
      .filter(Boolean);

    const attachedIds = new Set(attached.map((d: any) => d.id));

    // 2. Obtener documentos de biblioteca institucional o de la misma vacante que no estén ya asociados
    let availableQuery = admin
      .from('training_documents')
      .select('*')
      .eq('org_id', program.org_id);

    if (program.role_id) {
      availableQuery = availableQuery.or(`scope.eq.organization,and(scope.eq.role,role_id.eq.${program.role_id})`);
    } else {
      availableQuery = availableQuery.eq('scope', 'organization');
    }

    const { data: documents, error: docsError } = await availableQuery;

    if (docsError) {
      console.error('[API Program Documents] Error fetching library documents:', docsError);
      return NextResponse.json({ error: 'Failed to load library documents' }, { status: 500 });
    }

    const available = (documents || [])
      .filter((doc) => !attachedIds.has(doc.id))
      .map((doc) => ({
        id: doc.id,
        orgId: doc.org_id,
        roleId: doc.role_id || undefined,
        scope: doc.scope,
        fileName: doc.file_name,
        fileType: doc.file_type,
        fileSize: doc.file_size || undefined,
        storagePath: doc.storage_path || undefined,
        extractedText: doc.extracted_text || undefined,
        aiSummary: doc.ai_summary || undefined,
        aiTopics: doc.ai_topics || [],
        status: doc.status,
        processingError: doc.processing_error || undefined,
        checksumSha256: doc.checksum_sha256 || undefined,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      }));

    return NextResponse.json({
      success: true,
      attached,
      available,
    });
  } catch (err: any) {
    console.error('[API Program Documents] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    const body = await request.json();
    const { documentId, required } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    // 1. Validar que el documento existe y pertenece a la organización
    const { data: document, error: docError } = await admin
      .from('training_documents')
      .select('*')
      .eq('id', documentId)
      .eq('org_id', program.org_id)
      .maybeSingle();

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found or does not belong to this org' }, { status: 404 });
    }

    // 2. Validar que el documento no pertenezca a otra vacante
    if (document.scope === 'role' && document.role_id !== program.role_id) {
      return NextResponse.json({ error: 'Document belongs to another role vacancy' }, { status: 409 });
    }

    // 3. Obtener el sort_order máximo para el programa
    const { data: maxAssoc } = await admin
      .from('training_program_documents')
      .select('sort_order')
      .eq('program_id', programId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextSortOrder = maxAssoc ? (maxAssoc.sort_order ?? 0) + 1 : 0;

    // 4. Crear la asociación de forma segura
    const { error: assocError } = await admin
      .from('training_program_documents')
      .upsert(
        {
          program_id: programId,
          document_id: documentId,
          sort_order: nextSortOrder,
          required: required ?? true,
        },
        {
          onConflict: 'program_id,document_id',
        }
      );

    if (assocError) {
      console.error('[API Program Documents] Association failed:', assocError);
      return NextResponse.json({ error: 'Failed to associate document with program' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[API Program Documents] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json({ error: 'documentId query parameter is required' }, { status: 400 });
    }

    // Borrar únicamente la relación asociativa del programa
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
  } catch (err: any) {
    console.error('[API Program Documents] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}
