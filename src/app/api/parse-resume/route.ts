import { NextResponse } from 'next/server';

// pdf-parse v2.x uses named export
import { PDFParse } from 'pdf-parse';
import * as mammoth from 'mammoth';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const parser = new PDFParse({ data: buffer });
        const data = await parser.getText();
        text = data.text;
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return NextResponse.json(
          { error: 'Could not read PDF. The file may be corrupted or password-protected.' },
          { status: 400 }
        );
      }
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file.name.endsWith('.docx')
    ) {
      try {
        const result = await mammoth.extractRawText({ buffer: buffer });
        text = result.value;
      } catch (docxError) {
        console.error('DOCX parsing error:', docxError);
        return NextResponse.json(
          { error: 'Could not read DOCX. The file may be corrupted or password-protected.' },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload PDF or DOCX.' },
        { status: 400 }
      );
    }

    if (!text || text.trim() === '') {
      return NextResponse.json(
        { error: 'Could not extract text from file. The document may be image-based or empty.' },
        { status: 400 }
      );
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      // If no key, return raw text with basic structure so the frontend doesn't break
      return NextResponse.json({ 
        success: true, 
        data: { 
          name: '', email: '', phone: '', summary: '', currentTitle: '',
          totalYearsExperience: 0, experience: [], education: [],
          skills: [], languages: [], certifications: [], redFlags: [],
          rawText: text.substring(0, 500),
        },
        rawText: text,
      });
    }

    const extractionPrompt = `Eres un experto en análisis de CVs/resumes. Extrae la siguiente información del CV proporcionado en formato JSON estricto.

REGLAS:
- Responde ÚNICAMENTE con un objeto JSON válido, sin delimitadores \`\`\`json ni ningún texto adicional.
- Si un campo no existe en el CV, usa string vacío "", 0, o array vacío [] según el tipo.
- Para fechas, usa el formato que aparezca en el CV. Si el candidato trabaja actualmente, usa "Actual" o "Present".
- En "redFlags" señala inconsistencias como: gaps grandes de empleo, cambios muy frecuentes de trabajo, progresión de carrera incoherente, o títulos inflados.
- El "summary" debe ser un resumen profesional conciso de 2-3 oraciones.

ESQUEMA JSON REQUERIDO:
{
  "name": "nombre completo del candidato",
  "email": "email del candidato",
  "phone": "teléfono del candidato",
  "summary": "resumen profesional en 2-3 líneas",
  "currentTitle": "último puesto de trabajo o actual",
  "totalYearsExperience": 0,
  "experience": [
    {
      "company": "nombre de la empresa",
      "title": "puesto/cargo",
      "startDate": "fecha de inicio",
      "endDate": "fecha fin o 'Actual'",
      "duration": "tiempo en el puesto (e.g. '2 años 3 meses')",
      "responsibilities": ["responsabilidad 1", "responsabilidad 2"],
      "achievements": ["logro cuantificable 1", "logro cuantificable 2"]
    }
  ],
  "education": [
    {
      "institution": "nombre de la institución",
      "degree": "título/grado obtenido",
      "field": "área de estudio",
      "year": "año de egreso"
    }
  ],
  "skills": ["habilidad1", "habilidad2"],
  "languages": ["idioma1 - nivel", "idioma2 - nivel"],
  "certifications": ["certificación1", "certificación2"],
  "redFlags": ["inconsistencia o gap detectado"]
}

TEXTO DEL CV:
${text}`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
         'HTTP-Referer': 'https://reclutify.com',
         'X-Title': 'Reclutify CV Parser',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: extractionPrompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errorText = await aiRes.text();
      console.error('OpenRouter API error:', errorText);
      return NextResponse.json(
        { error: 'AI extraction service unavailable. Please try again.' },
        { status: 502 }
      );
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let parsedData;
    try {
      parsedData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse JSON from AI response:', jsonStr);
      return NextResponse.json(
        { error: 'Failed to parse CV data. Please try a different file format.' },
        { status: 500 }
      );
    }

    // Ensure all expected fields exist with defaults
    const safeData = {
      name: parsedData.name || '',
      email: parsedData.email || '',
      phone: parsedData.phone || '',
      summary: parsedData.summary || '',
      currentTitle: parsedData.currentTitle || parsedData.current_title || '',
      totalYearsExperience: parsedData.totalYearsExperience || parsedData.years_experience || 0,
      experience: Array.isArray(parsedData.experience) ? parsedData.experience : 
                  Array.isArray(parsedData.work_history) ? parsedData.work_history.map((w: Record<string, unknown>) => ({
                    company: w.company || '',
                    title: w.title || '',
                    startDate: w.startDate || '',
                    endDate: w.endDate || '',
                    duration: w.duration || '',
                    responsibilities: Array.isArray(w.responsibilities) ? w.responsibilities : [],
                    achievements: Array.isArray(w.achievements) ? w.achievements : 
                                  Array.isArray(w.highlights) ? w.highlights : [],
                  })) : [],
      education: Array.isArray(parsedData.education) ? parsedData.education : [],
      skills: Array.isArray(parsedData.skills) ? parsedData.skills : [],
      languages: Array.isArray(parsedData.languages) ? parsedData.languages : [],
      certifications: Array.isArray(parsedData.certifications) ? parsedData.certifications : [],
      redFlags: Array.isArray(parsedData.redFlags) ? parsedData.redFlags : [],
    };

    return NextResponse.json({ success: true, data: safeData, rawText: text });
  } catch (error) {
    console.error('Parse resume error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
