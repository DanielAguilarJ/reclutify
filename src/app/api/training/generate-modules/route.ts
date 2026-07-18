import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import {
  generateModulesRequestSchema,
  generatedTrainingModulesSchema,
} from '@/lib/training/contracts';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_CONTEXT_CHARS = 60_000;

type ProgramDocRow = {
  id: string;
  file_name: string;
  extracted_text: string | null;
  status: string;
};

export async function POST(req: NextRequest) {
  try {
    const parsed = generateModulesRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { programId } = parsed.data;

    // 1. Autorizar admin y cargar programa
    const { program, admin, user } = await requireProgramAdmin(programId);

    // 2. Guard: solo programas en draft
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Modules can only be generated for draft programs' },
        { status: 409 }
      );
    }

    // 3. Cargar documentos asociados al programa
    const { data: associations, error: assocError } = await admin
      .from('training_program_documents')
      .select(`
        training_documents (
          id,
          file_name,
          extracted_text,
          status
        )
      `)
      .eq('program_id', programId);

    if (assocError) {
      console.error('[Generate Modules API] Error loading associations:', assocError);
      return NextResponse.json({ error: 'Failed to load program documents' }, { status: 500 });
    }

    // 4. Solo documentos ready con texto extraído
    const programDocs: ProgramDocRow[] = (associations ?? [])
      .map((assoc: Record<string, unknown>) => assoc.training_documents as ProgramDocRow)
      .filter((d): d is ProgramDocRow =>
        Boolean(d) && d.status === 'ready' && Boolean(d.extracted_text)
      );

    if (programDocs.length === 0) {
      return NextResponse.json(
        { error: 'No ready documents found. Please upload and process documents first.' },
        { status: 400 }
      );
    }

    // 5. Obtener nombre de la empresa
    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', program.org_id)
      .single();

    const companyName = orgData?.name ?? 'Reclutify Client';

    // 6. Construir contexto (máximo 60,000 caracteres)
    let totalChars = 0;
    const documentContext = programDocs
      .map((doc) => {
        const text = doc.extracted_text ?? '';
        const remaining = MAX_CONTEXT_CHARS - totalChars;
        if (remaining <= 0) return null;
        const excerpt = text.slice(0, remaining);
        totalChars += excerpt.length;
        return `--- DOCUMENT: ${doc.file_name} (ID: ${doc.id}) ---\n${excerpt}`;
      })
      .filter((entry): entry is string => entry !== null)
      .join('\n\n');

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL ?? 'google/gemini-2.5-flash';

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    // 7. Generar módulos con AI
    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify Training Center',
      },
      body: JSON.stringify({
        model: TRAINING_AI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an expert corporate training designer. Given company documents, create a structured training program with modules ordered from foundational to advanced. Always respond with valid JSON only.

RULES:
- Create clear, actionable training modules based on the document content.
- Order modules from basic/foundational concepts to advanced/specialized topics.
- durationEstimate must be an integer representing estimated minutes.
- sourceDocumentIds MUST contain only valid UUID string IDs from the documents listed below.
- Include practical evaluation questions that test real understanding.
- Write in the same language as the source documents.
- Each section body should be comprehensive (at least 3-4 paragraphs of teaching content).
- evaluationEnabled must be a boolean.`,
          },
          {
            role: 'user',
            content: `Create a structured training program titled "${program.title}" for the company ${companyName}.
Here are the available document files:
${programDocs.map((d) => `- Name: ${d.file_name} | ID: ${d.id}`).join('\n')}

COMPANY DOCUMENTS:
${documentContext}

Return a JSON array (no wrapper object) of training modules with this structure:
[
  {
    "title": "Module Title",
    "description": "Brief description",
    "sections": [
      {
        "title": "Section Title",
        "body": "Detailed section content",
        "keyPoints": ["Key takeaway 1", "Key takeaway 2"]
      }
    ],
    "durationEstimate": 30,
    "evaluationEnabled": true,
    "sourceDocumentIds": ["${programDocs[0]?.id ?? 'uuid'}"],
    "evaluationQuestions": [
      {
        "question": "The question text",
        "type": "multiple_choice",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "Option A",
        "explanation": "Why this is correct"
      }
    ]
  }
]`,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Generate Modules API] AI API error:', errorText);
      return NextResponse.json({ error: 'AI service unavailable. Please try again.' }, { status: 502 });
    }

    const aiData = (await aiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = aiData.choices?.[0]?.message?.content ?? '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let rawGenerated: unknown;
    try {
      rawGenerated = JSON.parse(jsonStr);
    } catch {
      console.error('[Generate Modules API] JSON parse error:', jsonStr.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI response. Please try again.' }, { status: 502 });
    }

    // Soportar tanto { modules: [...] } como [...]
    const modulesRaw = Array.isArray(rawGenerated)
      ? rawGenerated
      : (rawGenerated as Record<string, unknown>)?.modules;

    const zodResult = generatedTrainingModulesSchema.safeParse(modulesRaw);
    if (!zodResult.success) {
      console.error('[Generate Modules API] AI response failed Zod validation:', zodResult.error.flatten());
      return NextResponse.json({ error: 'AI returned invalid module structure' }, { status: 502 });
    }

    // 8. Validar que cada sourceDocumentId pertenezca al programa
    const allowedDocumentIds = new Set(programDocs.map((d) => d.id));
    const normalizedModules = zodResult.data.map((mod, index) => {
      const sourceIds = mod.sourceDocumentIds.filter((id) => {
        if (!allowedDocumentIds.has(id)) {
          console.warn('[Generate Modules API] AI returned unauthorized source document:', id);
          return false;
        }
        return true;
      });

      return {
        id: crypto.randomUUID(),
        title: mod.title,
        description: mod.description ?? '',
        content: { sections: mod.sections },
        sortOrder: index,
        durationEstimate: Math.max(1, mod.durationEstimate ?? 30),
        evaluationEnabled: mod.evaluationEnabled,
        sourceDocumentIds: sourceIds,
        evaluationQuestions: mod.evaluationQuestions,
      };
    });

    // 9. Llamar a la RPC replace_training_modules en una única transacción
    const { data: persistedModules, error: rpcError } = await admin.rpc(
      'replace_training_modules',
      {
        p_actor_user_id: user.id,
        p_program_id: programId,
        p_modules: normalizedModules,
      }
    );

    if (rpcError) {
      console.error('[Generate Modules API] SQL RPC replace modules failed:', rpcError);
      return NextResponse.json(
        { error: rpcError.message || 'Failed to replace program modules in transaction' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      modules: persistedModules,
    });
  } catch (error: unknown) {
    console.error('[Generate Modules API] General failure:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
