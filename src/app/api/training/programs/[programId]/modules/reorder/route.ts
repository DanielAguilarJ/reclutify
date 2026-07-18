import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { loadDraftModules, replaceDraftModules } from '@/lib/training/modules';
import { reorderTrainingModulesSchema } from '@/lib/training/contracts';

export const runtime = 'nodejs';

// PATCH: Reordenar los módulos del programa de forma transaccional
export async function PATCH(
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

    const parsed = reorderTrainingModulesSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 2. Cargar módulos actuales
    const currentModules = await loadDraftModules(admin, programId);
    const modulesMap = new Map(currentModules.map((m) => [m.id, m]));

    const existingIds = currentModules.map((module) => module.id);
    const requestedIds = parsed.data.moduleIds;

    const existingSet = new Set(existingIds);
    const requestedSet = new Set(requestedIds);

    const isExactPermutation =
      requestedIds.length === existingIds.length &&
      requestedSet.size === requestedIds.length &&
      requestedIds.every((id) => existingSet.has(id)) &&
      existingIds.every((id) => requestedSet.has(id));

    if (!isExactPermutation) {
      return NextResponse.json(
        {
          error:
            'moduleIds must contain every program module exactly once',
        },
        { status: 400 }
      );
    }

    // 3. Crear lista reordenada en memoria
    const updatedModulesList = requestedIds.map((id, index) => {
      const mod = modulesMap.get(id)!;
      return {
        ...mod,
        sortOrder: index,
      };
    });

    // 4. Reemplazar transaccionalmente
    await replaceDraftModules(admin, user.id, programId, updatedModulesList);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[API Modules Reorder] Unexpected error:', err);
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
