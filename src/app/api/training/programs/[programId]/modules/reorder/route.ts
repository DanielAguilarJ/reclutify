import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import { loadDraftModules, replaceDraftModules } from '@/lib/training/modules';

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

    const body = await request.json();
    const { moduleIds } = body;

    if (!moduleIds || !Array.isArray(moduleIds) || moduleIds.length === 0) {
      return NextResponse.json({ error: 'moduleIds array is required' }, { status: 400 });
    }

    // 2. Cargar módulos actuales
    const currentModules = await loadDraftModules(admin, programId);
    const modulesMap = new Map(currentModules.map((m) => [m.id, m]));

    // Verificar que los IDs coincidan
    for (const id of moduleIds) {
      if (!modulesMap.has(id)) {
        return NextResponse.json({ error: `Module ID ${id} does not belong to this program` }, { status: 400 });
      }
    }

    // 3. Crear lista reordenada en memoria
    const updatedModulesList = moduleIds.map((id, index) => {
      const mod = modulesMap.get(id)!;
      return {
        ...mod,
        sortOrder: index,
      };
    });

    // Añadir de vuelta los módulos que no se enviaron en el array (por si acaso)
    const sentIds = new Set(moduleIds);
    let nextIndex = updatedModulesList.length;
    for (const mod of currentModules) {
      if (!sentIds.has(mod.id)) {
        updatedModulesList.push({
          ...mod,
          sortOrder: nextIndex++,
        });
      }
    }

    // 4. Reemplazar transaccionalmente
    await replaceDraftModules(admin, user.id, programId, updatedModulesList);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[API Modules Reorder] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Unauthorized' },
      { status: err.status || 500 }
    );
  }
}
