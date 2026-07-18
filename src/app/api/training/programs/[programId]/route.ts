import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;

    // 1. Autorizar admin
    const { program, admin } = await requireProgramAdmin(programId);

    // 2. Obtener rol asociado
    let role = null;
    if (program.role_id) {
      const { data: roleData, error: roleError } = await admin
        .from('roles')
        .select('*')
        .eq('id', program.role_id)
        .maybeSingle();

      if (roleError) {
        console.error('[API GET Program] Error fetching role:', roleError);
      } else {
        role = roleData;
      }
    }

    // 3. Obtener documentos asociados al programa vía tabla intermedia
    const { data: associations, error: assocError } = await admin
      .from('training_program_documents')
      .select(`
        sort_order,
        required,
        training_documents (
          id,
          org_id,
          role_id,
          scope,
          file_name,
          file_type,
          file_size,
          storage_path,
          extracted_text,
          ai_summary,
          ai_topics,
          status,
          processing_error,
          checksum_sha256,
          created_at,
          updated_at
        )
      `)
      .eq('program_id', programId)
      .order('sort_order', { ascending: true });

    if (assocError) {
      console.error('[API GET Program] Error fetching program documents:', assocError);
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    // Mapear asociaciones a TrainingDocument
    const documents = (associations || [])
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

    // 4. Obtener módulos del programa incluyendo las relaciones con documentos fuente
    const { data: modulesData, error: modsError } = await admin
      .from('training_modules')
      .select(`
        *,
        training_module_documents (
          document_id
        )
      `)
      .eq('program_id', programId)
      .order('sort_order', { ascending: true });

    if (modsError) {
      console.error('[API GET Program] Error fetching modules:', modsError);
      return NextResponse.json({ error: 'Failed to load modules' }, { status: 500 });
    }

    const modules = (modulesData || []).map((row: any) => {
      const docIds = Array.isArray(row.training_module_documents)
        ? row.training_module_documents.map((d: any) => d.document_id as string)
        : [];
      return {
        id: row.id,
        programId: row.program_id,
        title: row.title,
        description: row.description || undefined,
        content: row.content || { sections: [] },
        sourceDocumentIds: docIds,
        sortOrder: row.sort_order ?? 0,
        durationEstimate: row.duration_estimate ?? 15,
        evaluationEnabled: row.evaluation_enabled ?? false,
        evaluationQuestions: row.evaluation_questions || [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      program: {
        id: program.id,
        orgId: program.org_id,
        roleId: program.role_id || undefined,
        title: program.title,
        description: program.description || undefined,
        isDefault: program.is_default ?? false,
        welcomeMessage: program.welcome_message || undefined,
        aiPersonality: program.ai_personality || 'friendly',
        status: program.status || 'draft',
        version: program.version ?? 1,
        passingScore: program.passing_score ?? 70,
        publishedAt: program.published_at || undefined,
        createdAt: program.created_at,
        updatedAt: program.updated_at,
      },
      role,
      documents,
      modules,
    });
  } catch (err: any) {
    console.error('[API GET Program] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    // 1. Si no está en draft, impedir edición
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Create a new program version before editing' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const updates: Record<string, any> = {};

    // 2. Filtrar únicamente campos permitidos
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description || null;
    if (body.welcomeMessage !== undefined) updates.welcome_message = body.welcomeMessage || null;
    if (body.aiPersonality !== undefined) updates.ai_personality = body.aiPersonality;
    if (body.passingScore !== undefined) {
      const score = Number(body.passingScore);
      if (Number.isNaN(score) || score < 0 || score > 100) {
        return NextResponse.json({ error: 'Invalid passingScore. Must be between 0 and 100.' }, { status: 400 });
      }
      updates.passing_score = score;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid update fields provided' }, { status: 400 });
    }

    // 3. Ejecutar actualización
    const { data: updated, error } = await admin
      .from('training_programs')
      .update(updates)
      .eq('id', programId)
      .select('*')
      .single();

    if (error) {
      console.error('[API PATCH Program] Error updating program:', error);
      return NextResponse.json({ error: 'Failed to update training program' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      program: {
        id: updated.id,
        orgId: updated.org_id,
        roleId: updated.role_id || undefined,
        title: updated.title,
        description: updated.description || undefined,
        isDefault: updated.is_default ?? false,
        welcomeMessage: updated.welcome_message || undefined,
        aiPersonality: updated.ai_personality || 'friendly',
        status: updated.status || 'draft',
        version: updated.version ?? 1,
        passingScore: updated.passing_score ?? 70,
        publishedAt: updated.published_at || undefined,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: any) {
    console.error('[API PATCH Program] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}
