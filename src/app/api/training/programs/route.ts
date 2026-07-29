import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/training/auth';
import { trainingApiErrorResponse } from '@/lib/training/http';
import { resolveTrainingRpcError } from '@/lib/training/rpc-errors';
import { createAdminClient } from '@/utils/supabase/admin';
import { createTrainingProgramSchema } from '@/lib/training/contracts';
import { mapTrainingProgram } from '@/lib/training/mappers';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser();

    const parsed = createTrainingProgramSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      roleId,
      title,
      description,
      welcomeMessage,
      aiPersonality,
      contentLanguage,
    } = parsed.data;

    const admin = createAdminClient();

    // Llamar a la RPC transaccional que maneja concurrencia y versiones
    const { data: programId, error: rpcError } = await admin.rpc(
      'create_training_program',
      {
        p_actor_user_id: user.id,
        p_role_id: roleId,
        p_title: title,
        p_description: description ?? null,
        p_welcome_message: welcomeMessage ?? null,
        p_ai_personality: aiPersonality,
      }
    );

    if (rpcError) {
      console.error('[Programs API] RPC create_training_program failed:', rpcError);

      // `role_not_found`, `forbidden` y `draft_version_already_exists` están
      // catalogados con el mismo status que devolvía esta ruta.
      const resolved = resolveTrainingRpcError(rpcError, 'en');

      if (resolved) {
        return NextResponse.json(
          { error: resolved.message },
          { status: resolved.status }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create training program' },
        { status: 500 }
      );
    }

    // El idioma de contenido no viaja en la RPC: `create_training_program` tiene
    // una firma fija y la columna es `NOT NULL DEFAULT 'es'`, así que cuando el
    // cliente no lo envía NO se escribe nada y la base aplica su defecto. Solo
    // cuando llega explícitamente se persiste, y siempre acotado por el esquema
    // al mismo dominio que el `CHECK` de la columna.
    if (contentLanguage !== undefined) {
      const { error: languageError } = await admin
        .from('training_programs')
        .update({ content_language: contentLanguage })
        .eq('id', programId as string);

      if (languageError) {
        console.error(
          '[Programs API] Failed to set content language on created program:',
          languageError
        );
        return NextResponse.json(
          { error: 'Program created but content language could not be set' },
          { status: 500 }
        );
      }
    }

    // Cargar el programa recién creado
    const { data: newProgram, error: loadError } = await admin
      .from('training_programs')
      .select('*')
      .eq('id', programId as string)
      .single();

    if (loadError || !newProgram) {
      console.error('[Programs API] Failed to load created program:', loadError);
      return NextResponse.json(
        { error: 'Program created but could not be loaded' },
        { status: 500 }
      );
    }

    return NextResponse.json(mapTrainingProgram(newProgram));
  } catch (err: unknown) {
    return trainingApiErrorResponse(err, '[Programs API] Unexpected failure');
  }
}
