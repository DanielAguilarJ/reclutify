import { NextRequest, NextResponse } from 'next/server';
import { requireProgramAdmin } from '@/lib/training/auth';
import {
  documentAiAnalysisSchema,
  trainingDocumentUploadMetadataSchema,
} from '@/lib/training/contracts';
import {
  sanitizeTrainingFileName,
  sha256,
  splitTrainingText,
  MAX_TRAINING_FILE_SIZE,
  ALLOWED_TRAINING_MIME_TYPES,
} from '@/lib/training/documents';
import * as mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const metadataResult = trainingDocumentUploadMetadataSchema.safeParse({
      programId: formData.get('programId'),
      scope: formData.get('scope') ?? 'role',
    });

    if (!metadataResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid upload metadata',
          issues: metadataResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const { programId, scope } = metadataResult.data;

    const rawFiles = formData.getAll('files');
    if (!rawFiles || rawFiles.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Limitar lote a máximo 5 archivos
    if (rawFiles.length > 5) {
      return NextResponse.json(
        { error: 'A maximum of 5 files is allowed per request' },
        { status: 400 }
      );
    }

    const files: File[] = [];
    for (const raw of rawFiles) {
      if (!(raw instanceof File)) {
        return NextResponse.json({ error: 'All upload elements must be files' }, { status: 400 });
      }
      files.push(raw);
    }

    // 1. Validar administrador del programa
    const { program, admin } = await requireProgramAdmin(programId);
    const orgId = program.org_id;
    const roleId = scope === 'role' ? program.role_id : null;

    if (scope === 'role' && !program.role_id) {
      return NextResponse.json({ error: 'Program is not bound to a role vacancy' }, { status: 400 });
    }

    // Guard: solo programas en draft pueden recibir nuevos documentos
    if (program.status !== 'draft') {
      return NextResponse.json(
        { error: 'Documents can only be uploaded to draft programs' },
        { status: 409 }
      );
    }

    const processedDocs: Record<string, unknown>[] = [];
    const failures: Array<{ fileName: string; error: string }> = [];

    // Procesar cada archivo de forma independiente
    for (const file of files) {
      try {
        // Validar tamaño
        if (file.size > MAX_TRAINING_FILE_SIZE) {
          throw new Error(`El archivo ${file.name} excede el máximo de 15 MB`);
        }

        // Validar tipo mime
        if (!ALLOWED_TRAINING_MIME_TYPES.has(file.type)) {
          throw new Error(`Tipo de archivo no permitido: ${file.type}`);
        }

        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const checksum = sha256(fileBuffer);

        const getExistingDuplicate = async () => {
          let duplicateQuery = admin
            .from('training_documents')
            .select('*')
            .eq('org_id', orgId)
            .eq('scope', scope)
            .eq('checksum_sha256', checksum);

          if (scope === 'organization') {
            duplicateQuery = duplicateQuery.is('role_id', null);
          } else {
            duplicateQuery = duplicateQuery.eq('role_id', roleId);
          }
          return await duplicateQuery.maybeSingle();
        };

        // 2. Buscar duplicado según scope
        const { data: existingDoc, error: duplicateError } = await getExistingDuplicate();
        if (duplicateError) throw duplicateError;

        let documentId: string;
        let finalDocRow: Record<string, unknown>;
        let isExisting = false;

        if (existingDoc) {
          documentId = existingDoc.id;
          finalDocRow = existingDoc;
          isExisting = true;
        } else {
          // Documento nuevo
          documentId = crypto.randomUUID();
          const safeFileName = sanitizeTrainingFileName(file.name);
          const storageScope = scope === 'organization' ? 'organization' : roleId;
          const storagePath = [orgId, storageScope, documentId, safeFileName].join('/');

          // Subir a Storage
          const { error: uploadError } = await admin.storage
            .from('training-documents')
            .upload(storagePath, fileBuffer, { contentType: file.type });

          if (uploadError) {
            console.error('[Upload API] Storage upload error:', uploadError);
            throw new Error('Failed to upload document to storage');
          }

          // Extraer texto
          let extractedText = '';
          try {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
              const mod = (await import('pdf-parse')) as unknown as
                | { default?: (buf: Buffer) => Promise<{ text: string }> }
                | ((buf: Buffer) => Promise<{ text: string }>);
              const pdfParse = typeof mod === 'function' ? mod : mod.default;
              if (typeof pdfParse !== 'function') {
                throw new Error('pdf-parse is not a callable function');
              }
              const parsed = await pdfParse(fileBuffer);
              extractedText = parsed.text;
            } else if (
              file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
              file.name.endsWith('.docx')
            ) {
              const parsed = await mammoth.extractRawText({ buffer: fileBuffer });
              extractedText = parsed.value;
            } else if (
              file.type === 'text/plain' ||
              file.name.endsWith('.txt') ||
              file.name.endsWith('.md')
            ) {
              extractedText = fileBuffer.toString('utf-8');
            }
          } catch (parseErr: unknown) {
            // Rollback del storage en caso de fallo catastrófico en parseo
            await admin.storage.from('training-documents').remove([storagePath]);
            const parseErrMsg = parseErr instanceof Error ? parseErr.message : 'Unknown parsing error';
            throw new Error(`Failed to parse file: ${parseErrMsg}`);
          }

          // Validar longitud del texto extraído
          let docStatus: 'ready' | 'needs_ocr' | 'failed' = 'ready';
          let processingError: string | null = null;

          if (!extractedText || extractedText.trim().length < 50) {
            if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
              docStatus = 'needs_ocr';
              processingError = 'El PDF parece escaneado y requiere OCR.';
            } else {
              docStatus = 'failed';
              processingError = 'El documento no contiene texto suficiente.';
            }
          }

          // Analizar con AI si está listo (con timeout de 45 segundos)
          let aiSummary = '';
          let aiTopics: unknown[] = [];
          const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
          const TRAINING_AI_MODEL = process.env.TRAINING_AI_MODEL || 'google/gemini-2.5-flash';

          if (docStatus === 'ready' && OPENROUTER_API_KEY && extractedText.trim().length >= 50) {
            const aiController = new AbortController();
            const aiTimeoutId = setTimeout(() => aiController.abort(), 45000);

            try {
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
                      content: 'You are an expert training analyzer. Respond only with a single valid JSON block containing summary and topics.',
                    },
                    {
                      role: 'user',
                      content: `Analyze this document. Extract a brief summary (2-3 sentences) and the key topics covered.
Return JSON format:
{
  "summary": "Brief summary...",
  "topics": [
    {
      "title": "Topic Title",
      "description": "Short description",
      "keyPoints": ["Point 1", "Point 2"]
    }
  ]
}

DOCUMENT CONTENT:
${extractedText.substring(0, 30000)}`,
                    },
                  ],
                  temperature: 0.1,
                  response_format: { type: 'json_object' },
                }),
                signal: aiController.signal,
              });

              if (aiResponse.ok) {
                const aiData = (await aiResponse.json()) as {
                  choices?: Array<{ message?: { content?: string } }>;
                };
                const content = aiData.choices?.[0]?.message?.content ?? '{}';
                const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
                let rawAnalysis: unknown;
                try {
                  rawAnalysis = JSON.parse(cleanContent);
                } catch {
                  rawAnalysis = {};
                }
                const analysisResult = documentAiAnalysisSchema.safeParse(rawAnalysis);
                if (analysisResult.success) {
                  aiSummary = analysisResult.data.summary;
                  aiTopics = analysisResult.data.topics;
                } else {
                  console.warn('[Upload API] AI analysis did not match schema, skipping');
                }
              }
            } catch (aiErr: unknown) {
              if (aiErr instanceof Error && aiErr.name === 'AbortError') {
                console.error('[Upload API] AI analysis timed out for file:', file.name);
              } else {
                console.error('[Upload API] AI analysis failed, continuing without it:', aiErr);
              }
            } finally {
              clearTimeout(aiTimeoutId);
            }
          }

          // Guardar registro en training_documents
          const nowIso = new Date().toISOString();
          const { data: newDoc, error: insertDocError } = await admin
            .from('training_documents')
            .insert({
              id: documentId,
              org_id: orgId,
              role_id: roleId,
              scope,
              file_name: safeFileName,
              file_type: file.type,
              file_size: file.size,
              storage_path: storagePath,
              extracted_text: extractedText,
              ai_summary: aiSummary || null,
              ai_topics: aiTopics,
              status: docStatus,
              processing_error: processingError,
              checksum_sha256: checksum,
              created_at: nowIso,
              updated_at: nowIso,
            })
            .select('*')
            .maybeSingle();

          if (insertDocError) {
            // Rollback de Storage
            await admin.storage.from('training-documents').remove([storagePath]);

            if (insertDocError.code === '23505') {
              const retryDuplicate = await getExistingDuplicate();
              if (retryDuplicate.data) {
                documentId = retryDuplicate.data.id;
                finalDocRow = retryDuplicate.data;
                isExisting = true;
              } else {
                throw insertDocError;
              }
            } else {
              throw insertDocError;
            }
          } else {
            finalDocRow = newDoc;
          }

          // Si el estado es ready y acabamos de crearlo, insertar chunks en lote
          if (!isExisting && docStatus === 'ready') {
            try {
              const chunks = splitTrainingText(extractedText);
              const chunkRows = chunks.map((chunk, index) => ({
                document_id: documentId,
                chunk_index: index,
                content: chunk,
                metadata: { file_name: safeFileName, scope, role_id: roleId },
              }));

              if (chunkRows.length > 0) {
                const { error: chunksError } = await admin
                  .from('training_document_chunks')
                  .insert(chunkRows);

                if (chunksError) throw chunksError;
              }
            } catch (chunksErr) {
              // Rollback completo
              await admin.from('training_documents').delete().eq('id', documentId);
              await admin.storage.from('training-documents').remove([storagePath]);
              throw chunksErr;
            }
          }
        }

        // 3. Crear asociación en training_program_documents
        const { data: existingAssoc } = await admin
          .from('training_program_documents')
          .select('*')
          .eq('program_id', programId)
          .eq('document_id', documentId)
          .maybeSingle();

        if (!existingAssoc) {
          const { data: maxAssoc } = await admin
            .from('training_program_documents')
            .select('sort_order')
            .eq('program_id', programId)
            .order('sort_order', { ascending: false })
            .limit(1)
            .maybeSingle();

          const nextSortOrder = maxAssoc ? (maxAssoc.sort_order ?? 0) + 1 : 0;

          const { error: assocError } = await admin
            .from('training_program_documents')
            .insert({
              program_id: programId,
              document_id: documentId,
              sort_order: nextSortOrder,
              required: true,
            });

          if (assocError) {
            if (!isExisting) {
              await admin.from('training_documents').delete().eq('id', documentId);
              await admin.storage.from('training-documents').remove([finalDocRow.storage_path as string]);
            }
            throw assocError;
          }
        }

        processedDocs.push({
          id: finalDocRow.id,
          orgId: finalDocRow.org_id,
          roleId: finalDocRow.role_id || undefined,
          scope: finalDocRow.scope,
          fileName: finalDocRow.file_name,
          fileType: finalDocRow.file_type,
          fileSize: finalDocRow.file_size || undefined,
          aiSummary: finalDocRow.ai_summary || undefined,
          aiTopics: finalDocRow.ai_topics || [],
          status: finalDocRow.status,
          processingError: finalDocRow.processing_error || undefined,
          createdAt: finalDocRow.created_at,
          updatedAt: finalDocRow.updated_at,
        });

      } catch (fileErr: unknown) {
        console.error(`[Upload API] File failed: ${file.name}`, fileErr);
        const fileErrMsg = fileErr instanceof Error ? fileErr.message : 'Error desconocido al procesar el archivo';
        failures.push({
          fileName: file.name,
          error: fileErrMsg,
        });
      }
    }

    return NextResponse.json({
      success: true,
      documents: processedDocs,
      failures,
    });
  } catch (error: unknown) {
    console.error('[Upload API] General failure:', error);
    const errMessage = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { error: errMessage },
      { status: 500 }
    );
  }
}
