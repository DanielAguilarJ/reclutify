import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { loadDraftModules, replaceDraftModules } from '@/lib/training/modules';

export const runtime = 'nodejs';

// PATCH: Editar un módulo manual de forma transaccional
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ programId: string; moduleId: string }> }
) {
  try {
    const { programId, moduleId } = await props.params;
    const { program, admin, user } = await requireProgramAdmin(programId);

    // 1. Validar que esté en draft
    if (program.status !== 'draft') {
      return NextResponse.json({ error: 'Program is not in draft status' }, { status: 409 });
    }

    // 2. Cargar módulos actuales
    const currentModules = await loadDraftModules(admin, programId);
    const targetModule = currentModules.find((m) => m.id === moduleId);

    if (!targetModule) {
      return NextResponse.json({ error: 'Module not found in this program' }, { status: 404 });
    }

    // 3. Verificar que no haya empleados con progreso
    const { data: progress } = await admin
      .from('training_progress')
      .select('id')
      .eq('module_id', moduleId)
      .limit(1);

    if (progress && progress.length > 0) {
      return NextResponse.json(
        { error: 'Cannot edit module. Program has active training progress.' },
        { status: 409 }
      );
    }

    const body = await request.json();
    const {
      title,
      description,
      content,
      durationEstimate,
      evaluationEnabled,
      evaluationQuestions,
      sourceDocumentIds,
    } = body;

    // 4. Validar documentos fuente
    const docIds = Array.isArray(sourceDocumentIds) ? sourceDocumentIds : targetModule.sourceDocumentIds;
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

    // 5. Aplicar cambios en memoria
    const updatedModulesList = currentModules.map((m) => {
      if (m.id === moduleId) {
        return {
          id: m.id,
          title: title !== undefined ? title : m.title,
          description: description !== undefined ? description || null : m.description,
          content: content !== undefined ? content || { sections: [] } : m.content,
          sortOrder: m.sortOrder,
          durationEstimate:
            durationEstimate !== undefined
              ? Math.max(1, Number(durationEstimate) || 30)
              : m.durationEstimate,
          evaluationEnabled:
            evaluationEnabled !== undefined ? !!evaluationEnabled : m.evaluationEnabled,
          evaluationQuestions:
            evaluationQuestions !== undefined
              ? Array.isArray(evaluationQuestions)
                ? evaluationQuestions
                : []
              : m.evaluationQuestions,
          sourceDocumentIds: docIds,
        };
      }
      return m;
    });

    // 6. Guardar usando la RPC transaccional
    await replaceDraftModules(admin, user.id, programId, updatedModulesList);

    const editedModule = updatedModulesList.find((m) => m.id === moduleId);

    return NextResponse.json({
      success: true,
      module: editedModule,
    });
  } catch (err: any) {
    console.error('[API Manual Module Edit] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}

// DELETE: Borrar un módulo manual de forma transaccional
export async function DELETE(
  request: NextRequest,
  props: { params: Promise<{ programId: string; moduleId: string }> }
) {
  try {
    const { programId, moduleId } = await props.params;
    const { program, admin, user } = await requireProgramAdmin(programId);

    // 1. Validar que esté en draft
    if (program.status !== 'draft') {
      return NextResponse.json({ error: 'Program is not in draft status' }, { status: 409 });
    }

    // 2. Cargar módulos actuales
    const currentModules = await loadDraftModules(admin, programId);
    const targetModule = currentModules.find((m) => m.id === moduleId);

    if (!targetModule) {
      return NextResponse.json({ error: 'Module not found in this program' }, { status: 404 });
    }

    // 3. Verificar que no haya empleados con progreso
    const { data: progress } = await admin
      .from('training_progress')
      .select('id')
      .eq('module_id', moduleId)
      .limit(1);

    if (progress && progress.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete module. Program has active training progress.' },
        { status: 409 }
      );
    }

    // 4. Crear lista filtrada y re-indexada en memoria
    const updatedModulesList = currentModules
      .filter((m) => m.id !== moduleId)
      .map((m, index) => ({
        ...m,
        sortOrder: index,
      }));

    // 5. Reemplazar transaccionalmente en la base de datos
    await replaceDraftModules(admin, user.id, programId, updatedModulesList);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[API Manual Module Delete] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}
