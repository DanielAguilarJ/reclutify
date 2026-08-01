import { NextResponse, type NextRequest } from 'next/server';

import { getOptionalApiUser } from '@/lib/api/auth';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { speechSynthesis } from '@/lib/api/openrouter';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { TTS_MODEL } from '@/lib/ai-model';
import { ttsRequestSchema } from '@/lib/schemas/interview';

/**
 * POST /api/tts — síntesis de voz de los mensajes de Zara.
 *
 * POR QUÉ ESTA RUTA NO EXIGE SESIÓN (Y SÍ TOPE DE TASA)
 * -----------------------------------------------------
 * Es una decisión razonada, no un descuido heredado. La ruta la usan tres
 * pantallas, y dos de ellas atienden a personas SIN cuenta:
 *
 *  - `InterviewRoom`, en los flujos de ticket y de enlace público, donde el
 *    candidato nunca se registra.
 *  - `useAiVoice`, que da voz al asesor virtual de `/informes/[courseId]`, una
 *    página pública para posibles clientes.
 *
 * Exigir sesión dejaría muda la entrevista en el flujo principal del producto.
 *
 * Podría exigirse la credencial de entrevista (`requireInterviewAccess`), como se
 * hace en `/api/chat`, pero el asesor virtual no tiene ninguna: no hay `roleId`
 * ni ticket en ese flujo. Sería un control que rompe una de las tres pantallas.
 *
 * Y a diferencia de `/api/chat` o `/api/evaluate`, **aquí no hay recurso que
 * proteger**: la ruta no lee ni escribe en la base de datos, no recibe
 * identificadores y no devuelve datos de nadie. Convierte un texto que el
 * llamante ya tiene en audio. El único riesgo real es el COSTE, y el control
 * correcto para el coste es el tope de tasa más un tope de longitud, que es
 * exactamente lo que se añade:
 *
 *  - `MAX_TTS_TEXT_LENGTH` (4 000 caracteres) acota el coste por llamada. Antes
 *    no había ninguno: el endpoint sintetizaba textos de cualquier tamaño, es
 *    decir, servía de sintetizador de audiolibros a cuenta del saldo ajeno.
 *  - `RATE_LIMITS.AI_TTS` acota el número de llamadas por usuario o IP.
 *
 * QUÉ MÁS SE CORRIGE
 * ------------------
 *  - **Cinco `console.log` con el contenido**: la ruta registraba los primeros
 *    80 caracteres de cada texto sintetizado. En una entrevista eso es el
 *    contenido de la conversación en los logs del servidor, indefinidamente.
 *  - **Fuga del mensaje de excepción**: el `catch` final devolvía
 *    `{ error: err.message }`, que en un fallo de `fetch` incluye la URL y el
 *    host del proveedor.
 *  - **Sin cancelación**: no se propagaba `request.signal`, así que si el
 *    candidato pasaba de turno o cerraba la pestaña, la síntesis se pagaba igual.
 */

export const runtime = 'nodejs';

/**
 * Voces por idioma.
 *
 * Configurables por entorno, como antes. Se mantienen los nombres
 * `NEXT_PUBLIC_*` por compatibilidad con los despliegues existentes aunque su
 * único consumidor sea el servidor: renombrarlos obligaría a reconfigurar cada
 * entorno para no ganar nada funcional.
 */
function resolveVoice(language: 'en' | 'es'): string {
  return language === 'es'
    ? process.env.NEXT_PUBLIC_VOICE_ES?.trim() || 'es-MX-Valeria:MAI-Voice-2'
    : process.env.NEXT_PUBLIC_VOICE_EN?.trim() || 'en-US-Harper:MAI-Voice-2';
}

export async function POST(req: NextRequest) {
  try {
    const rawBody: unknown = await req.json().catch(() => {
      throw ApiError.badRequest('Request body must be valid JSON');
    });

    const body = ttsRequestSchema.parse(rawBody);

    // La sesión es opcional y solo sirve para elegir el identificador de cuota:
    // un candidato autenticado no comparte tope con el resto de su oficina.
    const user = await getOptionalApiUser();

    await enforceRateLimit(req, RATE_LIMITS.AI_TTS, user?.id);

    const { audio, contentType } = await speechSynthesis({
      model: TTS_MODEL,
      input: body.text,
      voice: resolveVoice(body.language),
      signal: req.signal,
    });

    return new NextResponse(audio, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(audio.byteLength),
        // El audio es determinista para un mismo texto y voz, pero se marca como
        // privado: es el contenido de una entrevista y no debe quedar en cachés
        // intermedias compartidas.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    return handleApiError(error, '[tts]');
  }
}
