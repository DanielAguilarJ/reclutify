import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import * as mammoth from 'mammoth';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text = '';

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const data = await pdfParse(buffer);
      text = data.text;
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: buffer });
      text = result.value;
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Please upload PDF or DOCX.' }, { status: 400 });
    }

    if (!text || text.trim() === '') {
       return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 });
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      // Si no hay key, al menos devolver el texto crudo simulando un parseado simple para que el Frontend no falle abruptamente si la api key falta
      return NextResponse.json({ 
        success: true, 
        data: { summary: "OpenRouter Key missing, raw text returned.", rawText: text.substring(0,500) },
        rawText: text
      });
    }

    const sysPrompt = `Extrae la siguiente información del CV en formato JSON estricto. Asegúrate de responder ÚNICAMENTE con un objeto JSON válido, sin delimitadores \`\`\`json ni ningún texto adicional. Si un campo no existe en el CV, déjalo vacío o en 0 según el tipo.
{
"name": "",
"email": "",
"phone": "",
"location": "",
"current_title": "",
"years_experience": 0,
"skills": [],
"education": [{"institution": "", "degree": "", "year": 0}],
"work_history": [{"company": "", "title": "", "duration": "", "highlights": []}],
"languages": [],
"summary": ""
} 
Aquí está el texto del CV:
${text}`;

    const aiRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: sysPrompt }]
      })
    });

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsedData = {};
    try {
      parsedData = JSON.parse(jsonStr);
    } catch (e) {
      console.error("Failed to parse JSON", jsonStr);
    }

    return NextResponse.json({ success: true, data: parsedData, rawText: text });
  } catch (error) {
    console.error('Parse resume error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
