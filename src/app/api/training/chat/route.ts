import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTrainingEmployeeFromSession } from '@/lib/training/session';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  trainingChatRequestSchema,
  trainingTutorResponseSchema,
  persistedTrainingMessagesSchema,
  persistedTrainingMessageSchema,
} from '@/lib/training/contracts';
import { validateChatCitations, CitationSource } from '@/lib/training/documents';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_CONTEXT_CHUNKS = 8;
const MAX_CONTEXT_CHARACTERS = 16_000;

type BoundedChunk = {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  training_documents?: { file_name: string } | null;
};

function sanitizePersistedMessages(
  raw: unknown
): Array<{
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  type?: 'text' | 'feedback';
  citations?: Array<{
    documentId: string;
    fileName: string;
    chunkIndex: number;
    snippet: string;
  }>;
}> {
  const result = persistedTrainingMessagesSchema.safeParse(raw);
  if (!result.success) {
    // Intentar rescatar mensajes válidos individualmente
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: unknown) => persistedTrainingMessageSchema.safeParse(item))
      .filter((r): r is { success: true; data: z.infer<typeof persistedTrainingMessageSchema> } => r.success)
      .map((r) => r.data);
  }
  return result.data;
}

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

    // 2. Si modo módulo, verificar propiedad
    if (mode === 'module' && moduleId) {
      const { data: moduleRow } = await admin
        .from('training_modules')
        .select('id')
        .eq('id', moduleId)
        .eq('program_id', employee.program_id)
        .maybeSingle();

      if (!moduleRow) {
        return NextResponse.json({ error: 'Module not found or not assigned' }, { status: 404 });
      }
    }

    // 3. Cargar documentos permitidos según el modo
    let documentIds: string[] = [];
    if (mode === 'module' && moduleId) {
      const { data: moduleDocAssocs } = await admin
        .from('training_module_documents')
        .select('document_id')
        .eq('module_id', moduleId);
      documentIds = moduleDocAssocs?.map((a) => a.document_id) ?? [];
    } else {
      const { data: programDocAssocs } = await admin
        .from('training_program_documents')
        .select('document_id')
        .eq('program_id', employee.program_id);
      documentIds = programDocAssocs?.map((a) => a.document_id) ?? [];
    }

    // 4. Buscar chunks y aplicar límite de contexto (RAG)
    let boundedChunks: BoundedChunk[] = [];
    if (documentIds.length > 0) {
      const userText = message?.trim();
      let candidateChunks: BoundedChunk[] = [];

      if (userText) {
        const { data: searchResults } = await admin
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
          .textSearch('content', userText, { type: 'websearch', config: 'simple' })
          .limit(MAX_CONTEXT_CHUNKS * 2);
        candidateChunks = (searchResults as unknown as BoundedChunk[]) ?? [];
      }

      // Si la búsqueda por texto no dio resultados, cargar sin filtro
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
        candidateChunks = (fallbackChunks as unknown as BoundedChunk[]) ?? [];
      }

      // Limitar a 8 chunks y 16,000 caracteres máximo
      let totalCharacters = 0;
      boundedChunks = candidateChunks
        .filter((chunk) => chunk.content && chunk.content.trim())
        .filter((chunk) => {
          if (totalCharacters + chunk.content.length > MAX_CONTEXT_CHARACTERS) return false;
          totalCharacters += chunk.content.length;
          return true;
        })
        .slice(0, MAX_CONTEXT_CHUNKS);
    }

    // 5. Buscar o crear la sesión de chat
    const sessionType = mode === 'general' ? 'general' : 'module';

    const getActiveSession = async () => {
      let query = admin
        .from('training_sessions')
        .select('*')
        .eq('employee_id', employee.id)
        .eq('session_type', sessionType)
        .is('ended_at', null);

      if (mode === 'module' && moduleId) {
        query = query.eq('module_id', moduleId);
      }
      return query.maybeSingle();
    };

    const { data: activeSession, error: sessError } = await getActiveSession();
    if (sessError) {
      console.error('[Chat API] Session fetch error:', sessError);
    }

    let chatSession: Record<string, unknown>;
    if (activeSession) {
      chatSession = activeSession as Record<string, unknown>;
    } else {
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();
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
        if (createSessError.code === '23505') {
          const retry = await getActiveSession();
          if (retry.data) {
            chatSession = retry.data as Record<string, unknown>;
          } else {
            return NextResponse.json({ error: 'Session conflict error' }, { status: 409 });
          }
        } else {
          console.error('[Chat API] Session insertion failed:', createSessError);
          return NextResponse.json({ error: 'Failed to establish training chat session' }, { status: 500 });
        }
      } else {
        chatSession = createdSession as Record<string, unknown>;
      }
    }

    const historyMessages = sanitizePersistedMessages(chatSession.messages);

    // Si es start y existe historial, devolvemos el historial y el último mensaje del tutor
    if (action === 'start' && historyMessages.length > 0) {
      const lastAssis = [...historyMessages].reverse().find((m) => m.role === 'assistant');
      return NextResponse.json({
        success: true,
        message: lastAssis?.content ?? 'Bienvenido de nuevo.',
        type: lastAssis?.type ?? 'text',
        contentCovered: false,
        evaluationReady: false,
        citations: lastAssis?.citations ?? [],
        history: historyMessages,
      });
    }

    // 6. Cargar contexto organizacional y personalización
    const { data: orgData } = await admin
      .from('organizations')
      .select('name')
      .eq('id', employee.org_id)
      .single();
    const companyName = orgData?.name ?? 'Reclutify Client';

    const pNotes = (employee.personalization_notes ?? {}) as Record<string, unknown>;
    const personalization = `
PERSONALIZATION Context:
- Strengths: ${Array.isArray(pNotes.strengths) ? pNotes.strengths.join(', ') : 'None'}
- Areas to watch: ${Array.isArray(pNotes.areasToWatch) ? pNotes.areasToWatch.join(', ') : 'None'}
- Learning Style: ${typeof pNotes.learningStyle === 'string' ? pNotes.learningStyle : 'Standard'}
- Custom Tips: ${Array.isArray(pNotes.customTips) ? pNotes.customTips.join(', ') : 'None'}
`;

    const ragContext = boundedChunks
      .map(
        (chunk) =>
          `[Chunk ID: ${chunk.id}] (File: ${
            chunk.training_documents?.file_name ?? 'Manual'
          }):\n${chunk.content}`
      )
      .join('\n\n');

    // 7. Preparar prompt
    const systemPrompt = `You are "Zara", a warm, friendly AI onboarding mentor at ${companyName}. You are guiding ${employee.name} in their training for the role of ${employee.role_title ?? 'their new position'}.

MODE: ${
      mode === 'module'
        ? 'Teaching Module. Teach the concepts of this module using the documents.'
        : 'General chat. Help the employee with general queries.'
    }

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

    // Construir mensajes para la llamada a la IA (NO incluir el mensaje del usuario aún)
    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyMessages.slice(-8).map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      })),
    ];

    // Agregar el mensaje del usuario al contexto de la IA (pero aún no persistir)
    if (action !== 'start' && message) {
      apiMessages.push({ role: 'user', content: message.trim() });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL ?? 'google/gemini-2.5-flash';

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    // 8. Llamar a la IA
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

    const aiData = (await aiResponse.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const rawContent = aiData.choices?.[0]?.message?.content ?? '{}';
    const cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();

    let rawParsed: unknown;
    try {
      rawParsed = JSON.parse(cleanContent);
    } catch {
      console.error('[Chat API] Failed to parse AI JSON:', rawContent);
      return NextResponse.json({ error: 'AI tutor is offline' }, { status: 502 });
    }

    const tutorResult = trainingTutorResponseSchema.safeParse(rawParsed);
    if (!tutorResult.success) {
      console.error('[Chat API] AI response failed Zod validation:', tutorResult.error.flatten());
      return NextResponse.json({ error: 'AI tutor is offline' }, { status: 502 });
    }

    const structured = tutorResult.data;

    // 9. Validar citas contra los chunks reales
    const citationIds = structured.citationChunkIds ?? [];
    const citations = validateChatCitations(citationIds, boundedChunks as unknown as CitationSource[]);

    // 10. Persistir en batch atómico (usuario + assistant) con la RPC
    const now = Date.now();
    const messageBatch: Array<{
      role: 'user' | 'assistant';
      content: string;
      timestamp: number;
      type?: 'text' | 'feedback';
      citations?: typeof citations;
    }> = [];

    if (action !== 'start' && message) {
      messageBatch.push({
        role: 'user',
        content: message.trim(),
        timestamp: now,
      });
    }

    messageBatch.push({
      role: 'assistant',
      content: structured.message,
      type: structured.type,
      citations,
      timestamp: now,
    });

    const { data: persistedHistory, error: appendError } = await admin.rpc(
      'append_training_session_messages',
      {
        p_employee_id: employee.id,
        p_session_id: chatSession.id as string,
        p_messages: messageBatch,
      }
    );

    if (appendError) {
      console.error('[Chat API] Failed to persist messages:', appendError);
      // No devolver 500: la IA respondió. El mensaje se retorna igual.
    }

    const finalHistory = sanitizePersistedMessages(persistedHistory ?? [...historyMessages, ...messageBatch]);

    return NextResponse.json({
      success: true,
      message: structured.message,
      type: structured.type,
      contentCovered: structured.contentCovered ?? false,
      evaluationReady: structured.evaluationReady ?? false,
      citations,
      history: finalHistory,
    });
  } catch (error: unknown) {
    console.error('[Chat API] Unexpected failure:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
