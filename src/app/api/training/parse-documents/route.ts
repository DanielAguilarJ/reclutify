import { NextRequest, NextResponse } from 'next/server';
import * as mammoth from 'mammoth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB per file

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided' },
        { status: 400 }
      );
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'AI service not configured' },
        { status: 503 }
      );
    }

    const results = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        results.push({
          fileName: file.name,
          error: 'File too large. Maximum size is 15 MB.',
          success: false,
        });
        continue;
      }

      let extractedText = '';

      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
          // Dynamic import for pdf-parse (Node.js only)
          const mod = (await import('pdf-parse')) as unknown as
            | { default?: (buf: Buffer) => Promise<{ text: string }> }
            | ((buf: Buffer) => Promise<{ text: string }>);
          const pdfParse = typeof mod === 'function' ? mod : mod.default;
          if (typeof pdfParse !== 'function') {
            throw new Error('pdf-parse module did not expose a callable parser');
          }
          const data = await pdfParse(buffer);
          extractedText = data.text;
        } else if (
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.name.endsWith('.docx')
        ) {
          const result = await mammoth.extractRawText({ buffer });
          extractedText = result.value;
        } else if (
          file.type === 'text/plain' ||
          file.name.endsWith('.txt') ||
          file.name.endsWith('.md')
        ) {
          extractedText = buffer.toString('utf-8');
        } else {
          results.push({
            fileName: file.name,
            error: 'Unsupported file type. Please upload PDF, DOCX, or TXT files.',
            success: false,
          });
          continue;
        }

        if (!extractedText || extractedText.trim().length < 50) {
          results.push({
            fileName: file.name,
            error: 'Could not extract meaningful text from this file.',
            success: false,
          });
          continue;
        }
      } catch (parseError) {
        console.error(`[parse-documents] Error parsing ${file.name}:`, parseError);
        results.push({
          fileName: file.name,
          error: 'Failed to parse file. It may be corrupted or password-protected.',
          success: false,
        });
        continue;
      }

      // Send to AI for structuring
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
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: 'You are an expert at analyzing company documents and extracting structured training content. Always respond with valid JSON only, no markdown delimiters.',
              },
              {
                role: 'user',
                content: `Analyze this company document and extract structured training content. Return JSON with the following structure:
{
  "summary": "Brief summary of what this document covers (2-3 sentences)",
  "topics": [
    {
      "title": "Topic title",
      "description": "Brief description of the topic",
      "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
    }
  ],
  "suggestedModules": [
    {
      "title": "Suggested module title",
      "description": "What this module would cover",
      "sections": [
        {
          "title": "Section title",
          "body": "Section content extracted/synthesized from the document",
          "keyPoints": ["Key takeaway 1", "Key takeaway 2"]
        }
      ],
      "durationEstimate": "Estimated time to complete (e.g. '30 minutes', '1 hour')"
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
        });

        if (!aiResponse.ok) {
          const errorText = await aiResponse.text();
          console.error(`[parse-documents] AI error for ${file.name}:`, errorText);
          results.push({
            fileName: file.name,
            extractedText: extractedText.substring(0, 2000),
            error: 'AI analysis failed. Raw text was extracted successfully.',
            success: false,
          });
          continue;
        }

        const aiData = await aiResponse.json();
        const content = aiData.choices?.[0]?.message?.content || '{}';
        const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const structured = JSON.parse(jsonStr);

        results.push({
          fileName: file.name,
          extractedText: extractedText.substring(0, 5000),
          aiAnalysis: structured,
          success: true,
        });
      } catch (aiError) {
        console.error(`[parse-documents] AI processing error for ${file.name}:`, aiError);
        results.push({
          fileName: file.name,
          extractedText: extractedText.substring(0, 2000),
          error: 'AI structuring failed, but text was extracted.',
          success: false,
        });
      }
    }

    return NextResponse.json({
      success: true,
      documents: results,
      totalProcessed: results.length,
      successCount: results.filter((r) => r.success).length,
    });
  } catch (error) {
    const err = error as Error;
    console.error('[parse-documents] failure:', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
