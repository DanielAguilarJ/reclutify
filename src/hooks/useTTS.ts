'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Síntesis de voz de Zara.
 *
 * QUÉ ENCAPSULA
 * -------------
 * `InterviewRoom` tenía esto repartido en unas 160 líneas dentro de `speakText`, con
 * cinco recursos que hay que liberar en el orden correcto: el elemento `Audio`, la URL
 * de objeto del blob, el temporizador de seguridad, el `AbortController` del `fetch` y
 * la voz nativa del navegador como respaldo. Olvidar uno no da error: da audio que
 * sigue sonando después de cambiar de turno, o memoria que no se suelta.
 *
 * LOS TRES PROBLEMAS QUE RESUELVE
 * -------------------------------
 *  1. **Una sola voz a la vez.** `speak()` cancela la anterior antes de empezar. Sin
 *     eso, dos turnos solapados producen dos audios simultáneos y el candidato oye a
 *     Zara hablando por encima de sí misma. Es la condición de carrera real de la sala.
 *  2. **La URL de objeto se revoca siempre**, incluido el camino de error. La versión
 *     anterior la revocaba en tres sitios distintos y ninguno cubría el fallo del
 *     `fetch`.
 *  3. **Respaldo a la voz nativa.** Si `/api/tts` falla —cuota agotada, proveedor
 *     caído—, la entrevista continúa con `speechSynthesis` en vez de quedarse muda.
 *     El texto es lo que importa; la calidad de la voz es secundaria.
 *
 * EL TEMPORIZADOR DE SEGURIDAD
 * ----------------------------
 * Un elemento `Audio` puede no emitir nunca `ended` —pestaña en segundo plano, audio
 * corrupto, política de reproducción automática—. Sin tope, `speak()` no resuelve nunca
 * y la entrevista se queda esperando a Zara para siempre. El tope se calcula del propio
 * texto en lugar de ser una constante: un cierre largo tarda más que un «Entendido».
 */

/** Estado de la síntesis. Discriminado. */
export type TtsState =
  | { status: 'idle' }
  | { status: 'loading'; text: string }
  | { status: 'speaking'; text: string }
  | { status: 'error'; message: string };

export interface UseTtsOptions {
  language: 'en' | 'es';
  /** Se llama al empezar a sonar. */
  onStart?: () => void;
  /** Se llama al terminar, tanto en éxito como en fallo. */
  onEnd?: () => void;
}

/**
 * Tope de tiempo de una locución, derivado de su longitud.
 *
 * Base de 8 s más 80 ms por carácter: cubre una locución normal con holgura sin dejar
 * la entrevista colgada. El techo de 90 s existe porque ningún mensaje de Zara llega
 * ahí (`max_tokens` lo acota antes) y un valor mayor sería esperar por nada.
 */
function safetyTimeoutMs(text: string): number {
  return Math.min(90_000, 8_000 + text.length * 80);
}

/**
 * Reproduce texto con la voz nativa del navegador.
 *
 * Es el respaldo cuando `/api/tts` no responde. Resuelve siempre —también en error—
 * porque el llamante está esperando para dar el turno al candidato, y dejarlo colgado
 * es peor que una voz robótica.
 */
function speakWithBrowser(text: string, language: 'en' | 'es'): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'es' ? 'es-ES' : 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1;

      // Se elige una voz del idioma correcto si existe. Sin esto, el navegador usa la
      // predeterminada del sistema, que puede leer español con fonética inglesa.
      const voice = window.speechSynthesis
        .getVoices()
        .find((candidate) => candidate.lang.startsWith(language === 'es' ? 'es' : 'en'));
      if (voice) utterance.voice = voice;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

export interface UseTtsResult {
  state: TtsState;
  isSpeaking: boolean;
  /**
   * Sintetiza y reproduce. Resuelve cuando el audio termina.
   *
   * Cancela cualquier locución anterior. Resuelve —no rechaza— si falla: el llamante
   * necesita continuar con la entrevista en cualquier caso.
   */
  speak: (text: string) => Promise<void>;
  /** Corta la locución en curso. Idempotente. */
  stop: () => void;
}

/**
 * Da voz a los mensajes de Zara.
 *
 * @example
 * const tts = useTTS({ language: 'es', onStart: () => setOrbActive(true) });
 * await tts.speak('Cuéntame sobre tu experiencia con React.');
 */
export function useTTS(options: UseTtsOptions): UseTtsResult {
  const [state, setState] = useState<TtsState>({ status: 'idle' });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Marca la locución actual. Una respuesta que llega después de haberse cancelado se
  // descarta comparando este valor, en vez de comprobar banderas que pueden pisarse.
  const generationRef = useRef(0);

  // Los callbacks van en un ref para que `speak` sea estable: si dependieran de las
  // opciones, cambiarían en cada render del componente que las pase en línea.
  const optionsRef = useRef(options);

  // El ref se actualiza en un EFECTO, no durante el render.
  //
  // Asignar `ref.current = valor` en el cuerpo del componente es escribir durante el
  // render, que React no garantiza que ocurra una sola vez: con renderizado concurrente
  // puede descartar un render a medias y la escritura queda hecha de todas formas. El
  // efecto sin array de dependencias corre después de cada render confirmado, que es el
  // momento correcto.
  useEffect(() => {
    optionsRef.current = options;
  });

  /** Libera los cinco recursos. El orden importa: primero cortar, luego soltar. */
  const release = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (audioRef.current) {
      try {
        audioRef.current.onended = null;
        audioRef.current.onerror = null;
        audioRef.current.pause();
        // Vaciar `src` es lo que suelta el buffer decodificado; pausar no basta.
        audioRef.current.src = '';
      } catch {
        // Un elemento ya descartado por el navegador lanza aquí.
      }
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stop = useCallback(() => {
    // Invalidar la generación ANTES de liberar: así una respuesta de `/api/tts` que
    // llegue después de este `stop()` se descarta en vez de empezar a sonar.
    generationRef.current += 1;
    release();
    setState({ status: 'idle' });
  }, [release]);

  const speak = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Cancela la anterior. Es lo que impide dos voces simultáneas.
      generationRef.current += 1;
      const generation = generationRef.current;
      release();

      setState({ status: 'loading', text: trimmed });

      const controller = new AbortController();
      abortRef.current = controller;

      let audioUrl: string | null = null;

      try {
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, language: optionsRef.current.language }),
          signal: controller.signal,
        });

        // Otra locución empezó mientras esperábamos: esta ya no vale.
        if (generation !== generationRef.current) return;

        if (!response.ok) {
          throw new Error(`TTS responded ${response.status}`);
        }

        const blob = await response.blob();
        if (generation !== generationRef.current) return;

        if (blob.size === 0) throw new Error('TTS returned empty audio');

        audioUrl = URL.createObjectURL(blob);
        objectUrlRef.current = audioUrl;

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        setState({ status: 'speaking', text: trimmed });
        optionsRef.current.onStart?.();

        await new Promise<void>((resolve) => {
          let settled = false;

          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };

          audio.onended = finish;
          audio.onerror = finish;

          // Sin este tope, un `Audio` que nunca emite `ended` deja la entrevista
          // esperando a Zara indefinidamente.
          timeoutRef.current = setTimeout(() => {
            console.warn('[useTTS] safety timeout reached; continuing');
            finish();
          }, safetyTimeoutMs(trimmed));

          audio.play().catch((error) => {
            console.error('[useTTS] playback failed:', error);
            finish();
          });
        });
      } catch (error) {
        // Una cancelación no es un fallo: la provocó un `stop()` o una locución nueva.
        const aborted = error instanceof Error && error.name === 'AbortError';

        if (!aborted && generation === generationRef.current) {
          console.error('[useTTS] falling back to browser speech:', error);
          setState({ status: 'speaking', text: trimmed });
          optionsRef.current.onStart?.();
          // La entrevista continúa con voz nativa en vez de quedarse muda.
          await speakWithBrowser(trimmed, optionsRef.current.language);
        }
      } finally {
        if (generation === generationRef.current) {
          release();
          setState({ status: 'idle' });
          optionsRef.current.onEnd?.();
        }
      }
    },
    [release],
  );

  useEffect(() => release, [release]);

  return {
    state,
    isSpeaking: state.status === 'speaking' || state.status === 'loading',
    speak,
    stop,
  };
}
