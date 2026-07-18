import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { programId } = body;

    if (!programId) {
      return NextResponse.json({ error: 'programId is required' }, { status: 400 });
    }

    // 1. Autorizar admin y cargar programa
    const { program, admin, user } = await requireProgramAdmin(programId);

    // 2. Cargar documentos asociados al programa vía tabla intermedia
    const { data: associations, error: assocError } = await admin
      .from('training_program_documents')
      .select(`
        training_documents (*)
      `)
      .eq('program_id', programId);

    if (assocError) {
      console.error('[Generate Modules API] Error loading associations:', assocError);
      return NextResponse.json({ error: 'Failed to load program documents' }, { status: 500 });
    }

    const programDocs = (associations || [])
      .map((assoc: any) => assoc.training_documents)
      .filter((d: any) => d && (d.status === 'ready' || d.extracted_text));

    if (programDocs.length === 0) {
      return NextResponse.json(
        { error: 'No ready documents found. Please upload and process documents first.' },
        { status: 400 }
      );
    }

    // 3. Obtener nombre de la empresa (usar el del perfil de la organización)
    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', program.org_id)
      .single();

    const companyName = orgData?.name || 'Reclutify Client';

    // 4. Construir contexto de los documentos para la AI
    const documentContext = programDocs
      .map(
        (doc: any) =>
          `--- DOCUMENT: ${doc.file_name} (ID: ${doc.id}) ---\n${doc.extracted_text || ''}`
      )
      .join('\n\n');

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL || 'google/gemini-2.5-flash';

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    // 5. Generar módulos con AI
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
- durationEstimate must be an integer representing estimated minutes (do not return strings, return numbers like 30).
- sourceDocumentIds MUST contain only valid UUID string IDs selected from the documents context.
- Include practical evaluation questions that test real understanding.
- Write in the same language as the source documents (if Spanish, write in Spanish).
- Each section body should be comprehensive (at least 3-4 paragraphs of teaching content).`,
          },
          {
            role: 'user',
            content: `Create a structured training program titled "${program.title}" for the company ${companyName}.
Here are the available document files:
${programDocs.map((d: any) => `- Name: ${d.file_name} | ID: ${d.id}`).join('\n')}

COMPANY DOCUMENTS:
${documentContext}

Return JSON structure:
{
  "modules": [
    {
      "title": "Module Title",
      "description": "Brief description of what this module covers",
      "content": {
        "sections": [
          {
            "title": "Section Title",
            "body": "Detailed section content (3-4 paragraphs minimum) with explanations, examples, and practical guidance.",
            "keyPoints": ["Key takeaway 1", "Key takeaway 2"]
          }
        ]
      },
      "durationEstimate": 30,
      "evaluationEnabled": true,
      "sourceDocumentIds": [${programDocs.map((d: any) => `"${d.id}"`).join(', ')}],
      "evaluationQuestions": [
        {
          "question": "The question text",
          "type": "multiple_choice | true_false | open_ended",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": "The correct answer",
          "explanation": "Why this is the correct answer"
        }
      ]
    }
  ]
}`,
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

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let generated: any;
    try {
      generated = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('[Generate Modules API] JSON parse error:', jsonStr.substring(0, 500));
      return NextResponse.json({ error: 'Failed to parse AI response. Please try again.' }, { status: 500 });
    }

    if (!generated.modules || !Array.isArray(generated.modules)) {
      return NextResponse.json({ error: 'AI returned invalid module structure' }, { status: 500 });
    }

    // 6. Validar que cada sourceDocumentId devuelto pertenezca al programa
    const allowedDocumentIds = new Set(programDocs.map((d: any) => d.id));

    // Formatear/normalizar módulos antes de enviarlos a la RPC
    const normalizedModules = generated.modules.map((mod: any, index: number) => {
      const sourceIds = Array.isArray(mod.sourceDocumentIds) ? mod.sourceDocumentIds : [];
      for (const srcId of sourceIds) {
        if (!allowedDocumentIds.has(srcId)) {
          throw new Error(`AI returned unauthorized source document: ${srcId}`);
        }
      }

      return {
        id: crypto.randomUUID(),
        title: mod.title || `Module ${index + 1}`,
        description: mod.description || '',
        content: mod.content || { sections: [] },
        sortOrder: index,
        durationEstimate: Math.max(1, Math.round(Number(mod.durationEstimate) || 30)),
        evaluationEnabled: mod.evaluationEnabled !== false,
        sourceDocumentIds: sourceIds,
        evaluationQuestions: (mod.evaluationQuestions || []).map((q: any) => ({
          question: q.question || 'Question',
          type: q.type || 'open_ended',
          options: Array.isArray(q.options) ? q.options : undefined,
          correctAnswer: q.correctAnswer || '',
          explanation: q.explanation || undefined,
        })),
      };
    });

    // 7. Llamar a la RPC replace_training_modules en una única transacción
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
  } catch (error: any) {
    console.error('[Generate Modules API] General failure:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
