import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text, language } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    console.log('\n====== TTS API ======');
    console.log('Text:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));

    // Voice selection: check model-specific voices
    const voiceEs = process.env.NEXT_PUBLIC_VOICE_ES || 'nova';
    const voiceEn = process.env.NEXT_PUBLIC_VOICE_EN || 'nova';
    const selectedVoice = language === 'es' ? voiceEs : voiceEn;

    // Use the correct OpenRouter TTS endpoint: /api/v1/audio/speech
    // This returns a raw audio byte stream, NOT JSON.
    const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini-tts-2025-12-15',
        input: text,
        voice: selectedVoice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('TTS API error:', response.status, errorText);
      throw new Error(`TTS API error ${response.status}: ${errorText}`);
    }

    // The response is already a raw audio stream — forward it directly
    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });

  } catch (error: unknown) {
    const err = error as Error;
    console.error('TTS Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
