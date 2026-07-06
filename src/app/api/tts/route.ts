import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text, language } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('TTS Error: OPENROUTER_API_KEY is not configured');
      return NextResponse.json(
        { error: 'TTS service not configured' },
        { status: 500 }
      );
    }

    console.log('\n====== TTS API ======');
    console.log('Text:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));

    // Voice selection: check model-specific voices
    const voiceEs = process.env.NEXT_PUBLIC_VOICE_ES || 'Kore';
    const voiceEn = process.env.NEXT_PUBLIC_VOICE_EN || 'Kore';
    const selectedVoice = language === 'es' ? voiceEs : voiceEn;

    // Try multiple response formats in order of preference.
    // Some TTS models on OpenRouter only support specific audio codecs.
    const formatsToTry = ['mp3', 'wav', 'pcm'] as const;
    const contentTypeMap: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pcm: 'audio/pcm',
    };

    let lastError = '';

    for (const format of formatsToTry) {
      console.log(`[TTS] Trying format: ${format}, voice: ${selectedVoice}`);

      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.1-flash-tts-preview',
          input: text,
          voice: selectedVoice,
          response_format: format,
        }),
      });

      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();

        // Use the Content-Type from OpenRouter if available, otherwise map it
        const upstreamContentType = response.headers.get('Content-Type');
        const resolvedContentType =
          upstreamContentType || contentTypeMap[format] || 'audio/mpeg';

        console.log(
          `[TTS] Success with format: ${format}, ` +
          `Content-Type: ${resolvedContentType}, ` +
          `size: ${audioBuffer.byteLength} bytes`
        );

        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': resolvedContentType,
            'Content-Length': audioBuffer.byteLength.toString(),
          },
        });
      }

      // Log the error but continue trying the next format
      const errorText = await response.text();
      lastError = `Format ${format}: ${response.status} — ${errorText}`;
      console.warn(`[TTS] Format ${format} failed:`, response.status, errorText);
    }

    // All formats failed
    console.error('[TTS] All formats failed. Last error:', lastError);
    throw new Error(`TTS generation failed with all formats. ${lastError}`);

  } catch (error: unknown) {
    const err = error as Error;
    console.error('TTS Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
