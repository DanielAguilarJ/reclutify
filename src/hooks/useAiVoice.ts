'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VoiceLanguage = 'es' | 'en';

/**
 * Timeout del fetch a /api/tts. Se deja apenas por encima del timeout que el
 * propio endpoint aplica contra el upstream (25s) para no abortar una peticion
 * que el servidor estaba a punto de resolver.
 */
const FETCH_TIMEOUT_MS = 28000;

/** Red de seguridad si el evento `onended` del audio nunca se dispara. */
function safetyTimeoutFor(text: string): number {
  return Math.min(120000, Math.max(30000, text.length * 150));
}

interface UseAiVoiceOptions {
  /** Selecciona la voz de Microsoft: es-MX-Valeria o en-US-Harper. */
  language: VoiceLanguage;
}

interface UseAiVoiceResult {
  /** Lee el texto con la voz de Microsoft. Resuelve cuando termina el audio. */
  speak: (text: string) => Promise<void>;
  /** Corta cualquier locucion en curso. */
  stop: () => void;
  /** true mientras la voz esta hablando. */
  isSpeaking: boolean;
  /** true si el navegador bloqueo el autoplay: hace falta un click del usuario. */
  blocked: boolean;
}

/**
 * Hook de voz para la IA (Zara). Usa el endpoint /api/tts, que sintetiza con
 * el modelo de Microsoft `mai-voice-2` (Azure Neural), y cae al
 * SpeechSynthesis del navegador si la red o el upstream fallan.
 *
 * Cada llamada a `speak()` cancela la locucion anterior, por lo que se puede
 * usar directamente al avanzar de pregunta sin que se solapen los audios.
 */
export function useAiVoice({ language }: UseAiVoiceOptions): UseAiVoiceResult {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // Token de generacion: invalida los callbacks de una locucion ya reemplazada.
  const generationRef = useRef(0);
  // Se lee dentro de callbacks asincronos, asi que `speak` no depende del idioma.
  const languageRef = useRef<VoiceLanguage>(language);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  /** Libera audio, object URL, timers y cancela el SpeechSynthesis. */
  const release = useCallback(() => {
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      try {
        audioRef.current.pause();
      } catch {
        // El elemento ya pudo ser descartado por el navegador.
      }
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    release();
    if (mountedRef.current) setIsSpeaking(false);
  }, [release]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      release();
    };
  }, [release]);

  const speak = useCallback(
    (text: string): Promise<void> => {
      const clean = (text || '').trim();
      if (!clean) return Promise.resolve();

      // Reemplaza cualquier locucion previa.
      const generation = ++generationRef.current;
      release();
      if (mountedRef.current) setIsSpeaking(true);

      return new Promise<void>((resolve) => {
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          // Si otra locucion tomo el relevo, no toques sus recursos.
          if (generationRef.current === generation) {
            release();
            if (mountedRef.current) setIsSpeaking(false);
          }
          resolve();
        };

        /** Voz del navegador cuando el endpoint de Microsoft no responde. */
        const fallbackSpeech = () => {
          if (generationRef.current !== generation) {
            finish();
            return;
          }
          if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            finish();
            return;
          }
          const synth = window.speechSynthesis;
          synth.cancel();

          const utterance = new SpeechSynthesisUtterance(clean);
          const lang = languageRef.current;
          utterance.lang = lang === 'es' ? 'es-ES' : 'en-US';
          utterance.rate = 1.0;
          utterance.pitch = 1.0;

          const voices = synth.getVoices();
          const preferred =
            voices.find(
              (v) =>
                v.lang.toLowerCase().startsWith(lang) &&
                /microsoft|google/i.test(v.name)
            ) || voices.find((v) => v.lang.toLowerCase().startsWith(lang));
          if (preferred) utterance.voice = preferred;

          utterance.onend = finish;
          utterance.onerror = finish;
          synth.speak(utterance);
        };

        safetyTimeoutRef.current = setTimeout(() => {
          console.warn('[useAiVoice] safety timeout — forzando fin de la locucion');
          finish();
        }, safetyTimeoutFor(clean));

        const controller = new AbortController();
        controllerRef.current = controller;
        const fetchTimeout = setTimeout(
          () => controller.abort(),
          FETCH_TIMEOUT_MS
        );

        fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean, language: languageRef.current }),
          signal: controller.signal,
        })
          .then((res) => {
            clearTimeout(fetchTimeout);
            if (!res.ok) throw new Error(`TTS respondio ${res.status}`);
            return res.blob();
          })
          .then((blob) => {
            if (generationRef.current !== generation) {
              finish();
              return;
            }
            if (!blob || blob.size === 0) throw new Error('Audio vacio');

            const url = URL.createObjectURL(blob);
            objectUrlRef.current = url;
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = finish;
            audio.onerror = () => fallbackSpeech();

            audio
              .play()
              .then(() => {
                if (mountedRef.current) setBlocked(false);
              })
              .catch((err: unknown) => {
                const name = (err as Error)?.name;
                if (name === 'NotAllowedError' && mountedRef.current) {
                  // Autoplay bloqueado: la UI debe pedir un click explicito.
                  setBlocked(true);
                }
                console.warn('[useAiVoice] play() rechazado:', err);
                fallbackSpeech();
              });
          })
          .catch((err: unknown) => {
            clearTimeout(fetchTimeout);
            if (generationRef.current !== generation) {
              finish();
              return;
            }
            console.warn('[useAiVoice] fallo /api/tts:', err);
            fallbackSpeech();
          });
      });
    },
    [release]
  );

  return { speak, stop, isSpeaking, blocked };
}
