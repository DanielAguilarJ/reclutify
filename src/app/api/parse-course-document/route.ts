import { NextResponse } from 'next/server';
import * as mammoth from 'mammoth';

// pdf-parse uses Node-only deps. Force Node runtime.
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó ningún archivo' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'Archivo demasiado grande. El máximo es 15 MB.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    // ─── Parse PDF ───
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const mod = (await import('pdf-parse')) as unknown as
          | { default?: (buf: Buffer) => Promise<{ text: string }> }
          | ((buf: Buffer) => Promise<{ text: string }>);
        const pdfParse = typeof mod === 'function' ? mod : mod.default;
        if (typeof pdfParse !== 'function') {
          throw new Error('pdf-parse module did not expose a callable parser');
        }
        const data = await pdfParse(buffer);
        text = data.text;
      } catch (pdfError) {
        const err = pdfError as Error;
        console.error('[parse-course-document] PDF error:', err.message);
        return NextResponse.json(
          { error: 'No se pudo leer el PDF. Puede estar corrupto o protegido.' },
          { status: 400 }
        );
      }
    }
    // ─── Parse DOCX ───
    else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: buffer });
        text = result.value;
      } catch (docxError) {
        console.error('[parse-course-document] DOCX error:', docxError);
        return NextResponse.json(
          { error: 'No se pudo leer el DOCX. Puede estar corrupto.' },
          { status: 400 }
        );
      }
    }
    // ─── Plain text ───
    else if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
      text = new TextDecoder('utf-8').decode(buffer);
    }
    // ─── Unsupported ───
    else {
      return NextResponse.json(
        { error: 'Tipo de archivo no soportado. Usa PDF, DOCX o TXT.' },
        { status: 400 }
      );
    }

    // Validate extracted text
    if (!text || text.trim().length < 50) {
      return NextResponse.json(
        { error: 'No se pudo extraer texto suficiente del documento. Verifica que no sea una imagen escaneada.' },
        { status: 400 }
      );
    }

    // ─── AI Extraction via DeepSeek V4 ───
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        { error: 'Servicio de IA no configurado.' },
        { status: 500 }
      );
    }

    // Truncate text if too long (DeepSeek handles ~128k context but we keep it reasonable)
    const maxChars = 60000;
    const truncatedText = text.length > maxChars ? text.substring(0, maxChars) : text;

    const extractionPrompt = `Eres un experto en análisis de documentos educativos y comerciales. Tu tarea es extraer TODA la información posible de un documento sobre un curso, programa, producto o servicio, y devolverla en formato JSON estructurado.

REGLAS ESTRICTAS:
- Responde ÚNICAMENTE con un objeto JSON válido. Sin delimitadores \`\`\`json, sin texto antes ni después.
- Si un campo no aparece en el documento, usa string vacío "", 0, o array vacío [] según el tipo.
- Extrae TODA la información relevante que encuentres, incluso si no encaja perfectamente en un campo.
- Si encuentras precios, siempre incluye el número y la moneda detectada.
- Para módulos/temas, extrae todos los que encuentres con su descripción si la hay.
- Si hay testimonios, citas de alumnos, o casos de éxito, inclúyelos.
- Si detectas frases de urgencia o escasez ("cupos limitados", "última fecha", etc.), inclúyelas.
- Si hay información sobre objeciones comunes y cómo se responden, extráelas.
- INFIERE la modalidad del documento si no es explícita: busca pistas como "presencial", "en línea", "zoom", "sede", etc.

ESQUEMA JSON REQUERIDO:
{
  "name": "nombre del curso/programa/producto",
  "description": "descripción general completa del programa",
  "objectives": ["objetivo 1", "objetivo 2", "..."],
  "benefits": ["beneficio 1", "beneficio 2", "..."],
  "targetAudience": "público objetivo al que va dirigido",
  "durationInfo": "duración del programa (ej: 8 semanas, 3 meses, 40 horas)",
  "modality": "presencial|online|hibrido",
  "modules": [
    {
      "title": "título del módulo/tema",
      "description": "descripción o contenido del módulo"
    }
  ],
  "plans": [
    {
      "name": "nombre del plan",
      "price": 0,
      "currency": "MXN",
      "features": ["incluye X", "incluye Y"],
      "isRecommended": false
    }
  ],
  "testimonials": ["testimonio o cita de alumno 1", "..."],
  "urgencyHooks": ["frase de urgencia 1 detectada en el documento", "..."],
  "objectionResponses": {
    "tipo_objecion": "respuesta sugerida basada en el documento"
  },
  "sessionDuration": 20
}

NOTAS DE INFERENCIA:
- Si no hay planes con precios explícitos pero mencionan "inversión" o "costo", crea un plan con ese dato.
- Si hay varios niveles o paquetes, crea un plan por cada uno.
- Si mencionan resultados, transformaciones o "al finalizar podrás...", pon esos como objetivos.
- Si mencionan ventajas competitivas o "por qué elegirnos", pon esos como beneficios.
- Para objectionResponses, infiere las objeciones comunes según el tipo de programa y genera respuestas basadas en la información del documento. Ejemplos de tipos: "precio", "tiempo", "resultados", "experiencia_previa".
- sessionDuration: sugiere 15-30 min según la complejidad del programa.

DOCUMENTO A ANALIZAR:
${truncatedText}`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://reclutify.com',
        'X-Title': 'Reclutify Course Document Parser',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-v4-flash',
        messages: [{ role: 'user', content: extractionPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error('[parse-course-document] OpenRouter error:', errorText);
      return NextResponse.json(
        { error: 'Servicio de IA no disponible. Intenta de nuevo.' },
        { status: 502 }
      );
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedData;
    try {
      parsedData = JSON.parse(jsonStr);
    } catch {
      console.error('[parse-course-document] JSON parse failed:', jsonStr.substring(0, 200));
      return NextResponse.json(
        { error: 'No se pudo procesar la respuesta de la IA. Intenta con otro documento.' },
        { status: 500 }
      );
    }

    // ─── Normalize and validate output ───
    const safeData = {
      name: typeof parsedData.name === 'string' ? parsedData.name : '',
      description: typeof parsedData.description === 'string' ? parsedData.description : '',
      objectives: Array.isArray(parsedData.objectives) ? parsedData.objectives.filter((o: unknown) => typeof o === 'string' && o.trim()) : [],
      benefits: Array.isArray(parsedData.benefits) ? parsedData.benefits.filter((b: unknown) => typeof b === 'string' && b.trim()) : [],
      targetAudience: typeof parsedData.targetAudience === 'string' ? parsedData.targetAudience : '',
      durationInfo: typeof parsedData.durationInfo === 'string' ? parsedData.durationInfo : '',
      modality: ['presencial', 'online', 'hibrido'].includes(parsedData.modality) ? parsedData.modality : 'presencial',
      sessionDuration: typeof parsedData.sessionDuration === 'number' ? Math.min(Math.max(parsedData.sessionDuration, 5), 120) : 20,
      modules: Array.isArray(parsedData.modules)
        ? parsedData.modules
            .filter((m: unknown) => m && typeof m === 'object' && 'title' in (m as Record<string, unknown>))
            .map((m: Record<string, unknown>) => ({
              title: typeof m.title === 'string' ? m.title : '',
              description: typeof m.description === 'string' ? m.description : '',
            }))
        : [],
      plans: Array.isArray(parsedData.plans)
        ? parsedData.plans
            .filter((p: unknown) => p && typeof p === 'object' && 'name' in (p as Record<string, unknown>))
            .map((p: Record<string, unknown>) => ({
              name: typeof p.name === 'string' ? p.name : '',
              price: typeof p.price === 'number' ? p.price : 0,
              currency: typeof p.currency === 'string' ? p.currency : 'MXN',
              features: Array.isArray(p.features) ? p.features.filter((f: unknown) => typeof f === 'string') : [],
              isRecommended: typeof p.isRecommended === 'boolean' ? p.isRecommended : false,
            }))
        : [],
      testimonials: Array.isArray(parsedData.testimonials) ? parsedData.testimonials.filter((t: unknown) => typeof t === 'string' && t.trim()) : [],
      urgencyHooks: Array.isArray(parsedData.urgencyHooks) ? parsedData.urgencyHooks.filter((u: unknown) => typeof u === 'string' && u.trim()) : [],
      objectionResponses: parsedData.objectionResponses && typeof parsedData.objectionResponses === 'object' && !Array.isArray(parsedData.objectionResponses)
        ? parsedData.objectionResponses as Record<string, string>
        : {},
    };

    // Count what was extracted for the summary
    const summary = {
      objectives: safeData.objectives.length,
      benefits: safeData.benefits.length,
      modules: safeData.modules.length,
      plans: safeData.plans.length,
      testimonials: safeData.testimonials.length,
      urgencyHooks: safeData.urgencyHooks.length,
      objectionResponses: Object.keys(safeData.objectionResponses).length,
    };

    return NextResponse.json({ success: true, data: safeData, summary });
  } catch (error) {
    const err = error as Error;
    console.error('[parse-course-document] failure:', err.message);
    return NextResponse.json(
      { error: 'Error interno al procesar el documento. Intenta con otro archivo.' },
      { status: 500 }
    );
  }
}
