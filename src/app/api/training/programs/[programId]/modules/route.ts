import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { manualTrainingModuleSchema } from '@/lib/training/contracts';
import { loadDraftModules, replaceDraftModules } from '@/lib/training/modules';

export const runtime = 'nodejs';

// POST: Crear un nuevo módulo manual de forma transaccional
export async function POST(
  request: NextRequest,
  props: { params: Promise<{ programId: string }> }
) {
  try {
    const { programId } = await props.params;
    const { program, admin, user } = await requireProgramAdmin(programId);

    // 1. Validar que esté en draft
    if (program.status !== 'draft') {
      return NextResponse.json({ error: 'Program is not in draft status' }, { status: 409 });
    }

    // 2. Verificar que no haya empleados con progreso
    const currentModules = await loadDraftModules(admin, programId);
    if (currentModules.length > 0) {
      const activeIds = currentModules.map((m) => m.id);
      const { data: progress } = await admin
        .from('training_progress')
        .select('id')
        .in('module_id', activeIds)
        .limit(1);

      if (progress && progress.length > 0) {
        return NextResponse.json(
          { error: 'Cannot add modules. Program already has active training progress.' },
          { status: 409 }
        );
      }
    }

    const bodyParsed = manualTrainingModuleSchema.safeParse(await request.json());
    if (!bodyParsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: bodyParsed.error.flatten() },
        { status: 400 }
      );
    }
    const {
      title,
      description,
      content,
      durationEstimate,
      evaluationEnabled,
      evaluationQuestions,
      sourceDocumentIds,
    } = bodyParsed.data;

    // 3. Validar documentos fuente (ya es array validado por Zod)
    const docIds = sourceDocumentIds;
    if (docIds.length > 0) {
      const { data: assocs } = await admin
        .from('training_program_documents')
        .select('document_id')
        .eq('program_id', programId)
        .in('document_id', docIds);

      const validDocIds = new Set(assocs?.map((a) => a.document_id) || []);
      for (const id of docIds) {
        if (!validDocIds.has(id)) {
          return NextResponse.json(
            { error: `Document ID ${id} is not associated to this program` },
            { status: 400 }
          );
        }
      }
    }

    // 4. Crear el nuevo módulo en memoria
    const newModuleId = crypto.randomUUID();
    const nextSortOrder = currentModules.length;

    const newModule = {
      id: newModuleId,
      title,
      description: description || null,
      content: content || { sections: [] },
      sortOrder: nextSortOrder,
      durationEstimate: Math.max(1, Number(durationEstimate) || 30),
      evaluationEnabled: !!evaluationEnabled,
      evaluationQuestions: Array.isArray(evaluationQuestions) ? evaluationQuestions : [],
      sourceDocumentIds: docIds,
    };

    const updatedModulesList = [...currentModules, newModule];

    // 5. Reemplazar transaccionalmente
    await replaceDraftModules(admin, user.id, programId, updatedModulesList);

    return NextResponse.json({
      success: true,
      module: newModule,
    });
  } catch (err: unknown) {
    console.error('[API Manual Module] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unauthorized';
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
