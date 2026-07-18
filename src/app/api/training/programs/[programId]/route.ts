import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { updateTrainingProgramSchema } from '@/lib/training/contracts';
import { trainingApiErrorResponse } from '@/lib/training/http';

export const runtime = 'nodejs';

type ProgramDocumentRow = {
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

type ModuleRow = {
  id: string;
  program_id: string;
  title: string;
  description: string | null;
  content: { sections: unknown[] } | null;
  sort_order: number | null;
  duration_estimate: number | null;
  evaluation_enabled: boolean | null;
  evaluation_questions: unknown;
  created_at: string;
  updated_at: string;
  training_module_documents: { document_id: string }[];
};

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    // Obtener rol asociado
    let role: Record<string, unknown> | null = null;
    if (program.role_id) {
      const { data: roleData, error: roleError } = await admin
        .from('roles')
        .select('*')
        .eq('id', program.role_id)
        .maybeSingle();

      if (roleError) {
        console.error('[API GET Program] Error fetching role:', roleError);
        return NextResponse.json({ error: 'Failed to fetch program context' }, { status: 500 });
      }
      role = roleData as Record<string, unknown> | null;
    }

    // Obtener documentos asociados (sin extracted_text, storage_path ni checksum)
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
      console.error('[API GET Program] Error fetching program documents:', assocError);
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
    }

    const documents = (associations as unknown as Array<{ training_documents: ProgramDocumentRow | ProgramDocumentRow[] | null }> ?? [])
      .map((assoc) => {
        const docRaw = assoc.training_documents;
        const doc = Array.isArray(docRaw) ? docRaw[0] : docRaw;
        if (!doc) return null;
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
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    // Obtener módulos
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

    const modules = (modulesData as ModuleRow[] ?? []).map((row) => {
      const docIds = Array.isArray(row.training_module_documents)
        ? row.training_module_documents.map((d) => d.document_id)
        : [];
      return {
        id: row.id,
        programId: row.program_id,
        title: row.title,
        description: row.description ?? undefined,
        content: row.content ?? { sections: [] },
        sourceDocumentIds: docIds,
        sortOrder: row.sort_order ?? 0,
        durationEstimate: row.duration_estimate ?? 15,
        evaluationEnabled: row.evaluation_enabled ?? false,
        evaluationQuestions: row.evaluation_questions ?? [],
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({
      success: true,
      program: {
        id: program.id,
        orgId: program.org_id,
        roleId: program.role_id ?? undefined,
        title: program.title,
        description: program.description ?? undefined,
        isDefault: program.is_default ?? false,
        welcomeMessage: program.welcome_message ?? undefined,
        aiPersonality: program.ai_personality ?? 'friendly',
        status: program.status ?? 'draft',
        version: program.version ?? 1,
        passingScore: program.passing_score ?? 70,
        publishedAt: program.published_at ?? undefined,
        createdAt: program.created_at,
        updatedAt: program.updated_at,
      },
      role,
      documents,
      modules,
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[API GET Program] Unexpected error');
  }
}

export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin } = await requireProgramAdmin(programId);

    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Create a new program version before editing' },
        { status: 409 }
      );
    }

    const parsed = updateTrainingProgramSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.welcomeMessage !== undefined) updates.welcome_message = body.welcomeMessage;
    if (body.aiPersonality !== undefined) updates.ai_personality = body.aiPersonality;
    if (body.passingScore !== undefined) updates.passing_score = body.passingScore;

    const { data: updated, error } = await admin
      .from('training_programs')
      .update(updates)
      .eq('id', programId)
      .eq('status', 'draft')
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('[API PATCH Program] Update failed:', error);
      return NextResponse.json({ error: 'Failed to update training program' }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'Program is no longer editable as a draft' },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      program: {
        id: updated.id,
        orgId: updated.org_id,
        roleId: updated.role_id ?? undefined,
        title: updated.title,
        description: updated.description ?? undefined,
        isDefault: updated.is_default ?? false,
        welcomeMessage: updated.welcome_message ?? undefined,
        aiPersonality: updated.ai_personality ?? 'friendly',
        status: updated.status ?? 'draft',
        version: updated.version ?? 1,
        passingScore: updated.passing_score ?? 70,
        publishedAt: updated.published_at ?? undefined,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[API PATCH Program] Unexpected error');
  }
}
