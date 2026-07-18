import { NextRequest, NextResponse } from 'next/server';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import { trainingChatRequestSchema } from '@/lib/training/contracts';
import { validateChatCitations } from '@/lib/training/documents';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CONTEXT_CHUNKS = 8;
const MAX_CONTEXT_CHARACTERS = 16000;

export async function POST(req: NextRequest) {
  try {
    // 1. Validar sesión del empleado
    const employee = await getTrainingEmployeeFromSession();
    if (!employee) {
      return NextResponse.json({ error: 'Unauthorized training session' }, { status: 401 });
    }

    const parsed = trainingChatRequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const body = parsed.data;
    const mode = body.mode;
    const moduleId = mode === 'module' ? body.moduleId : undefined;
    const action = 'action' in body ? body.action : undefined;
    const message = 'message' in body ? body.message : undefined;

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // 2. Cargar documentos permitidos según el modo
    let documentIds: string[] = [];
    if (mode === 'module' && moduleId) {
      const { data: moduleDocAssocs } = await admin
        .from('training_module_documents')
        .select('document_id')
        .eq('module_id', moduleId);
      documentIds = moduleDocAssocs?.map(a => a.document_id) || [];
    } else {
      // mode === 'general': todos los documentos del programa
      const { data: programDocAssocs } = await admin
        .from('training_program_documents')
        .select('document_id')
        .eq('program_id', employee.program_id);
      documentIds = programDocAssocs?.map(a => a.document_id) || [];
    }

    // 3. Buscar chunks y aplicar límite de contexto (RAG)
    let boundedChunks: any[] = [];
    if (documentIds.length > 0) {
      let query = admin
        .from('training_document_chunks')
        .select(`
          id,
          document_id,
          chunk_index,
          content,
          training_documents (
            file_name
          )
        `)
        .in('document_id', documentIds)
        .limit(MAX_CONTEXT_CHUNKS * 2); // Cargar el doble para filtrar

      const userText = message?.trim();
      if (userText) {
        query = query.textSearch('content', userText, {
          type: 'websearch',
          config: 'simple',
        });
      }

      const { data: rawChunks } = await query;

      // Si la búsqueda con t_vector no dio resultados, cargar sin textSearch
      let candidateChunks = rawChunks || [];
      if (candidateChunks.length === 0) {
        const { data: fallbackChunks } = await admin
          .from('training_document_chunks')
          .select(`
            id,
            document_id,
            chunk_index,
            content,
            training_documents (
              file_name
            )
          `)
          .in('document_id', documentIds)
          .limit(MAX_CONTEXT_CHUNKS);
        candidateChunks = fallbackChunks || [];
      }

      // Limitar a 8 chunks y 16,000 caracteres máximo
      let totalCharacters = 0;
      boundedChunks = candidateChunks
        .filter((chunk: any) => chunk.content && chunk.content.trim())
        .filter((chunk: any) => {
          if (totalCharacters + chunk.content.length > MAX_CONTEXT_CHARACTERS) {
            return false;
          }
          totalCharacters += chunk.content.length;
          return true;
        })
        .slice(0, MAX_CONTEXT_CHUNKS);
    }

    // 4. Buscar o crear la sesión de chat correspondiente
    const sessionType = mode === 'general' ? 'general' : 'module';
    
    const getActiveSession = async () => {
      let querySession = admin
        .from('training_sessions')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('session_type', sessionType)
        .is('ended_at', null);

      if (mode === 'module' && moduleId) {
        querySession = querySession.eq('module_id', moduleId);
      }
      return await querySession.maybeSingle();
    };

    let { data: activeSession, error: sessError } = await getActiveSession();
    if (sessError) {
      console.error('[Chat API] Session fetch error:', sessError);
    }

    let chatSession: any;
    if (activeSession) {
      chatSession = activeSession;
    } else {
      const sessionId = crypto.randomUUID();
      const { data: createdSession, error: createSessError } = await admin
        .from('training_sessions')
        .insert({
          id: sessionId,
          employee_id: employee.id,
          module_id: mode === 'module' ? moduleId : null,
          session_type: sessionType,
          messages: [],
          started_at: now,
        })
        .select('*')
        .maybeSingle();

      if (createSessError) {
        // En caso de concurrencia (código 23505), intentar volver a consultar la sesión
        if (createSessError.code === '23505') {
          const retry = await getActiveSession();
          if (retry.data) {
            chatSession = retry.data;
          } else {
            return NextResponse.json({ error: 'Session conflict error' }, { status: 409 });
          }
        } else {
          console.error('[Chat API] Session insertion failed:', createSessError);
          return NextResponse.json({ error: 'Failed to establish training chat session' }, { status: 500 });
        }
      } else {
        chatSession = createdSession;
      }
    }

    const historyMessages = Array.isArray(chatSession.messages) ? chatSession.messages : [];

    // Si es start y existe historial, devolvemos el historial y el mensaje del tutor
    if (action === 'start' && historyMessages.length > 0) {
      const lastAssis = [...historyMessages].reverse().find(m => m.role === 'assistant');
      return NextResponse.json({
        success: true,
        message: lastAssis?.content || 'Bienvenido de nuevo.',
        type: lastAssis?.type || 'text',
        contentCovered: false,
        evaluationReady: false,
        citations: lastAssis?.citations || [],
        history: historyMessages,
      });
    }

    // 5. Cargar contexto organizacional y personalización
    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', employee.org_id)
      .single();
    const companyName = orgData?.name || 'Reclutify Client';

    const pNotes = employee.personalization_notes || {};
    const personalization = `
PERSONALIZATION Context:
- Strengths: ${Array.isArray(pNotes.strengths) ? pNotes.strengths.join(', ') : 'None'}
- Areas to watch: ${Array.isArray(pNotes.areasToWatch) ? pNotes.areasToWatch.join(', ') : 'None'}
- Learning Style: ${pNotes.learningStyle || 'Standard'}
- Custom Tips: ${Array.isArray(pNotes.customTips) ? pNotes.customTips.join(', ') : 'None'}
`;

    const ragContext = boundedChunks
      .map(
        (chunk) =>
          `[Chunk ID: ${chunk.id}] (File: ${chunk.training_documents?.file_name || 'Manual'}):\n${chunk.content}`
      )
      .join('\n\n');

    // 6. Preparar prompt
    const systemPrompt = `You are "Zara", a warm, friendly AI onboarding mentor at ${companyName}. You are guiding ${employee.name} in their training for the role of ${employee.role_title || 'their new position'}.

MODE: ${mode === 'module' ? `Teaching Module. Teach the concepts of this module using the documents.` : 'General chat. Help the employee with general queries.'}

${personalization}

SOURCE DOCUMENTS REFERENCE (RAG CONTEXT):
${ragContext || 'No context documents available.'}

BEHAVIOR:
1. Speak as a helpful colleague. Respond in the same language the employee uses.
2. Incorporate the student's strengths and support their areas to watch.
3. If using information from a chunk, append its "Chunk ID" to citationChunkIds array.
4. When in module mode, cover all concepts. Once the content has been discussed, indicate that they can start the evaluation.

RESPONSE FORMAT:
You MUST respond with a single valid JSON block only.
{
  "message": "Your conversational message to the employee...",
  "type": "text | feedback",
  "contentCovered": true | false,
  "evaluationReady": true | false,
  "citationChunkIds": ["chunk-uuid-1"]
}`;

    // Construir mensajes para la llamada
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages.slice(-8).map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
    ];

    if (action !== 'start' && message) {
      apiMessages.push({ role: 'user', content: message.trim() });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL || 'google/gemini-2.5-flash';

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

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
        messages: apiMessages,
        temperature: 0.6,
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Chat API] AI service error:', errorText);
      return NextResponse.json({ error: 'AI tutor is offline' }, { status: 502 });
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '{}';
    const cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();

    let structured: any;
    try {
      structured = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[Chat API] Failed to parse AI JSON:', rawContent);
      structured = {
        message: cleanContent || 'I understand. Let me know if you have any questions.',
        type: 'text',
        contentCovered: false,
        evaluationReady: false,
        citationChunkIds: [],
      };
    }

    // 7. Validar citas contra los chunks reales
    const citationIds: string[] = Array.isArray(structured.citationChunkIds) ? structured.citationChunkIds : [];
    const citations = validateChatCitations(citationIds, boundedChunks);

    // 8. Persistir en la sesión del empleado
    const newMessages = [...historyMessages];
    if (action !== 'start' && message) {
      newMessages.push({
        role: 'user',
        content: message.trim(),
        timestamp: Date.now(),
      });
    }
    newMessages.push({
      role: 'assistant',
      content: structured.message,
      type: structured.type || 'text',
      citations,
      timestamp: Date.now(),
    });

    await admin
      .from('training_sessions')
      .update({ messages: newMessages })
      .eq('id', chatSession.id);

    return NextResponse.json({
      success: true,
      message: structured.message,
      type: structured.type || 'text',
      contentCovered: !!structured.contentCovered,
      evaluationReady: !!structured.evaluationReady,
      citations,
      history: newMessages,
    });
  } catch (error: any) {
    console.error('[Chat API] Unexpected failure:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
