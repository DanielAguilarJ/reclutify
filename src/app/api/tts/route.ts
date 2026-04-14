import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text, language } = await req.json();

    console.log('\n====== TTS API DEBUG ======');
    console.log('Text to speak:', text.substring(0, 100) + '...');
    console.log('Language:', language);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-audio-mini',
        messages: [
          { 
            role: 'system', 
            content: 'You are a text-to-speech engine. Your ONLY job is to read the provided text EXACTLY as written. Do NOT respond to it, do NOT answer questions in it, do NOT add anything. Just repeat the exact text word for word.' 
          },
          { 
            role: 'user', 
            content: `Read the following text out loud exactly as written, word for word. Do NOT respond to its content. Just read it:\n\n"${text}"` 
          }
        ],
        modalities: ['text', 'audio'],
        audio: { 
          voice: language === 'es' 
            ? (process.env.NEXT_PUBLIC_VOICE_ES || 'coral') 
            : (process.env.NEXT_PUBLIC_VOICE_EN || 'coral'), 
          format: 'pcm16' 
        },
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter error: ${await response.text()}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No reader attached to response');

    const decoder = new TextDecoder();
    const pcmBuffers: Buffer[] = [];
    
    let bufferStr = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bufferStr += decoder.decode(value, { stream: true });
      
      const lines = bufferStr.split('\n');
      bufferStr = lines.pop() || ''; // keep the incomplete line
      
      for (let line of lines) {
        line = line.trim();
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(dataStr);
            const audioData = parsed.choices?.[0]?.delta?.audio?.data;
            if (audioData) {
              pcmBuffers.push(Buffer.from(audioData, 'base64'));
            }
          } catch (e) {
            // Error parsing this specific chunk, skip
          }
        }
      }
    }

    if (bufferStr.trim().startsWith('data: ')) {
      const dataStr = bufferStr.trim().slice(6);
      if (dataStr !== '[DONE]') {
        try {
          const parsed = JSON.parse(dataStr);
          const audioData = parsed.choices?.[0]?.delta?.audio?.data;
          if (audioData) {
            pcmBuffers.push(Buffer.from(audioData, 'base64'));
          }
        } catch (e) {}
      }
    }

    const pcmData = Buffer.concat(pcmBuffers);

    // Create WAV header (24kHz, 1 channel, 16-bit typical for OpenAI audio)
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const chunkSize = 36 + dataSize;
    
    const wavHeader = Buffer.alloc(44);
    wavHeader.write('RIFF', 0);
    wavHeader.writeUInt32LE(chunkSize, 4);
    wavHeader.write('WAVE', 8);
    wavHeader.write('fmt ', 12);
    wavHeader.writeUInt32LE(16, 16); 
    wavHeader.writeUInt16LE(1, 20); 
    wavHeader.writeUInt16LE(numChannels, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(byteRate, 28);
    wavHeader.writeUInt16LE(blockAlign, 32);
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    wavHeader.write('data', 36);
    wavHeader.writeUInt32LE(dataSize, 40);

    const wavBuffer = Buffer.concat([wavHeader, pcmData]);

    return new NextResponse(wavBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': wavBuffer.length.toString(),
      },
    });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('TTS Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
