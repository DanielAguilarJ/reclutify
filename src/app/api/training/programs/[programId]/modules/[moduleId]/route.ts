import { NextRequest, NextResponse } from 'next/server';
import {
  requireProgramAdmin,
  TrainingAuthError,
} from '@/lib/training/auth';
import { loadDraftModules, replaceDraftModules } from '@/lib/training/modules';
import {
  updateManualTrainingModuleSchema,
  manualTrainingModuleSchema,
} from '@/lib/training/contracts';
import { trainingApiErrorResponse } from '@/lib/training/http';

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
    const {
      data: progress,
      error: progressError,
    } = await admin
      .from('training_progress')
      .select('id')
      .eq('module_id', moduleId)
      .limit(1);

    if (progressError) {
      console.error(
        '[API Manual Module] Progress query failed:',
        progressError
      );

      return NextResponse.json(
        { error: 'Could not validate module usage' },
        { status: 500 }
      );
    }

    if (progress && progress.length > 0) {
      return NextResponse.json(
        { error: 'Cannot edit module. Program has active training progress.' },
        { status: 409 }
      );
    }

    // Validar body parcial
    const bodyJson = await request.json();
    const partialResult = updateManualTrainingModuleSchema.safeParse(bodyJson);

    if (!partialResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          issues: partialResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    // Fusionar con el módulo actual
    const candidateModule = {
      title: partialResult.data.title ?? targetModule.title,
      description:
        partialResult.data.description !== undefined
          ? partialResult.data.description ?? undefined
          : targetModule.description ?? undefined,
      content: partialResult.data.content ?? targetModule.content,
      durationEstimate:
        partialResult.data.durationEstimate ?? targetModule.durationEstimate,
      evaluationEnabled:
        partialResult.data.evaluationEnabled ?? targetModule.evaluationEnabled,
      evaluationQuestions:
        partialResult.data.evaluationQuestions ??
        targetModule.evaluationQuestions,
      sourceDocumentIds:
        partialResult.data.sourceDocumentIds ??
        targetModule.sourceDocumentIds,
    };

    // Validar módulo completo fusionado
    const completeResult = manualTrainingModuleSchema.safeParse(candidateModule);
    if (!completeResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid resulting module',
          issues: completeResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const validatedModule = completeResult.data;

    // 4. Validar documentos fuente
    const docIds = validatedModule.sourceDocumentIds;
    if (docIds.length > 0) {
      const {
        data: associations,
        error: associationsError,
      } = await admin
        .from('training_program_documents')
        .select('document_id')
        .eq('program_id', programId)
        .in('document_id', docIds);

      if (associationsError) {
        console.error(
          '[API Manual Module] Document validation failed:',
          associationsError
        );

        return NextResponse.json(
          { error: 'Could not validate module documents' },
          { status: 500 }
        );
      }

      const validDocIds = new Set(associations?.map((a) => a.document_id) || []);
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
          title: validatedModule.title,
          description: validatedModule.description ?? null,
          content: validatedModule.content,
          sortOrder: m.sortOrder,
          durationEstimate: validatedModule.durationEstimate,
          evaluationEnabled: validatedModule.evaluationEnabled,
          evaluationQuestions: validatedModule.evaluationQuestions,
          sourceDocumentIds: validatedModule.sourceDocumentIds,
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
  } catch (error: unknown) {
    return trainingApiErrorResponse(error, '[API Manual Module Edit] Unexpected error');
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
    const {
      data: progress,
      error: progressError,
    } = await admin
      .from('training_progress')
      .select('id')
      .eq('module_id', moduleId)
      .limit(1);

    if (progressError) {
      console.error(
        '[API Manual Module] Progress query failed:',
        progressError
      );

      return NextResponse.json(
        { error: 'Could not validate module usage' },
        { status: 500 }
      );
    }

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
  } catch (error: unknown) {
    return trainingApiErrorResponse(error, '[API Manual Module Delete] Unexpected error');
  }
}
