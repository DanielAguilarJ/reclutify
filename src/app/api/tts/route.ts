import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { text, language } = await req.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.error('[TTS] OPENROUTER_API_KEY is not configured');
      return NextResponse.json(
        { error: 'TTS service not configured' },
        { status: 500 }
      );
    }

    console.log('\n====== TTS API ======');
    console.log('[TTS] Text:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
    console.log('[TTS] Language:', language);

    // GPT Audio Mini voice mapping (OpenAI voices via OpenRouter):
    // Female voices: nova, shimmer, coral, sage, alloy
    // 'coral' is OpenAI's recommended voice for natural, warm conversational agents
    const voiceEs = process.env.NEXT_PUBLIC_VOICE_ES || 'coral';
    const voiceEn = process.env.NEXT_PUBLIC_VOICE_EN || 'coral';
    const selectedVoice = language === 'es' ? voiceEs : voiceEn;

    console.log('[TTS] Model: openai/gpt-audio-mini, Voice:', selectedVoice);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-audio-mini',
          input: text,
          voice: selectedVoice,
          response_format: 'mp3',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[TTS] OpenRouter error:', response.status, errorBody);
        return NextResponse.json(
          { error: `TTS upstream error: ${response.status}`, detail: errorBody },
          { status: 502 }
        );
      }

      const audioBuffer = await response.arrayBuffer();

      if (audioBuffer.byteLength === 0) {
        console.error('[TTS] OpenRouter returned empty audio buffer');
        return NextResponse.json(
          { error: 'TTS returned empty audio' },
          { status: 502 }
        );
      }

      // Detect content type from upstream; default to audio/mpeg for mp3
      const upstreamCT = response.headers.get('Content-Type');
      const contentType = upstreamCT
        ? upstreamCT.split(';')[0].trim()
        : 'audio/mpeg';

      console.log(
        `[TTS] Success — size: ${audioBuffer.byteLength} bytes, ` +
        `Content-Type: ${contentType}`
      );

      return new NextResponse(audioBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': audioBuffer.byteLength.toString(),
        },
      });

    } catch (fetchError: unknown) {
      clearTimeout(timeout);
      const fe = fetchError as Error;
      if (fe.name === 'AbortError') {
        console.error('[TTS] Request timed out after 25s');
        return NextResponse.json(
          { error: 'TTS request timed out' },
          { status: 504 }
        );
      }
      throw fetchError;
    }

  } catch (error: unknown) {
    const err = error as Error;
    console.error('[TTS] Unhandled error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
