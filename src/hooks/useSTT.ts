'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Transcripción de la voz del candidato.
 *
 * QUÉ ENCAPSULA
 * -------------
 * `InterviewRoom` tenía la instancia de `SpeechRecognition`, el vigilante de reinicio y
 * la acumulación del texto repartidos en unas 130 líneas y cinco refs. `SpeechToText`
 * (`src/lib/stt.ts`) hace algo parecido pero **fija `recognition.lang = 'en-US'`**, sin
 * parámetro de idioma, en un producto cuyo idioma principal es el español: los
 * candidatos hispanohablantes se transcribían con el modelo acústico inglés.
 *
 * POR QUÉ HACE FALTA UN VIGILANTE
 * -------------------------------
 * La API de reconocimiento de voz del navegador se detiene sola. No siempre avisa: en
 * Chrome, tras unos segundos de silencio emite `onend`, y a veces se queda sin emitir
 * ningún evento con el micrófono abierto. Si nadie la reinicia, el candidato habla y
 * nada se transcribe, sin ningún error visible. El vigilante comprueba cuándo llegó el
 * último evento y reinicia si pasó demasiado tiempo.
 *
 * LA CONDICIÓN DE CARRERA QUE EVITA
 * ---------------------------------
 * `recognition.start()` lanza `InvalidStateError` si ya está arrancado, y `stop()` lanza
 * si ya está parado. Con dos banderas independientes —una del componente, otra del
 * navegador— es fácil que se desincronicen y el reinicio quede en un bucle de
 * excepciones. Aquí hay UNA bandera (`runningRef`) y todas las transiciones pasan por
 * ella.
 */

/** Estado del reconocimiento. Discriminado. */
export type SttState =
  | { status: 'idle' }
  | { status: 'listening'; interim: string }
  | { status: 'unsupported' }
  | { status: 'error'; error: string };

export interface UseSttOptions {
  language: 'en' | 'es';
  /** Se llama con cada fragmento final reconocido. */
  onResult?: (text: string) => void;
  /** Se llama con el texto provisional, para pintarlo mientras habla. */
  onInterim?: (text: string) => void;
  /** Se llama con un error que no sea silencio. */
  onError?: (error: string) => void;
}

/**
 * Silencio máximo antes de reiniciar el reconocimiento, en milisegundos.
 *
 * Diez segundos: bastante para que un candidato piense su respuesta sin que se le corte,
 * y poco para que un reconocimiento muerto no se lleve la respuesta entera.
 */
const WATCHDOG_SILENCE_MS = 10_000;

/** Cada cuánto comprueba el vigilante. */
const WATCHDOG_INTERVAL_MS = 3_000;

/** Constructor disponible en el navegador, o `null`. */
function resolveRecognitionConstructor(): (new () => SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  // Safari solo expone la variante `webkit`. `speech.d.ts` declara ambas opcionales,
  // así que el compilador exige esta comprobación.
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

export interface UseSttResult {
  state: SttState;
  isListening: boolean;
  /** Texto provisional de lo que se está diciendo ahora. */
  interim: string;
  /** Arranca el reconocimiento. Idempotente. */
  start: () => void;
  /** Detiene el reconocimiento y el vigilante. Idempotente. */
  stop: () => void;
  /** `true` si el navegador soporta reconocimiento de voz. */
  isSupported: boolean;
}

/**
 * Transcribe la voz del candidato.
 *
 * @example
 * const stt = useSTT({ language: 'es', onResult: (text) => appendToBuffer(text) });
 * stt.start();
 */
export function useSTT(options: UseSttOptions): UseSttResult {
  const [state, setState] = useState<SttState>({ status: 'idle' });

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  // Bandera ÚNICA del ciclo de vida. Ver el comentario de cabecera.
  const runningRef = useRef(false);
  // Intención del componente: distingue «se paró solo» de «lo paramos nosotros», que es
  // lo que decide si el vigilante debe reiniciar.
  const shouldListenRef = useRef(false);
  // Inicializado a 0 y no a `Date.now()`: llamar a una función impura en el
  // inicializador de `useRef` la ejecuta durante el render, y el valor resultante varía
  // entre el render del servidor y el del cliente. El valor real lo pone `start()`, que
  // es el único momento en que la marca significa algo.
  const lastEventAtRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const isSupported = typeof window !== 'undefined' && resolveRecognitionConstructor() !== null;

  /** Suelta la instancia sin disparar sus manejadores. */
  const teardownRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    // Los manejadores se quitan ANTES de parar: `onend` reinicia, así que dejarlo
    // puesto haría que `stop()` provocara un arranque inmediato.
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;

    try {
      recognition.abort();
    } catch {
      // Lanza si ya estaba parado; es el estado buscado.
    }

    recognitionRef.current = null;
    runningRef.current = false;
  }, []);

  /** Arranca la instancia. Declarado como ref para que `onend` pueda reiniciar. */
  const startRecognitionRef = useRef<() => void>(() => {});

  const startRecognition = useCallback(() => {
    const Constructor = resolveRecognitionConstructor();

    if (!Constructor) {
      setState({ status: 'unsupported' });
      return;
    }

    if (runningRef.current) return;

    // Una instancia anterior se suelta antes de crear otra: reutilizarla tras un
    // `onend` es lo que produce el `InvalidStateError` en bucle.
    teardownRecognition();

    const recognition = new Constructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    // El idioma REAL, que es el bug que tenía `src/lib/stt.ts` fijado a `en-US`.
    recognition.lang = optionsRef.current.language === 'es' ? 'es-ES' : 'en-US';

    recognition.onresult = (event) => {
      lastEventAtRef.current = Date.now();

      let finalText = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const alternative = event.results[i]?.[0];
        if (!alternative) continue;

        if (event.results[i].isFinal) {
          finalText += alternative.transcript;
        } else {
          interimText += alternative.transcript;
        }
      }

      if (interimText) {
        setState({ status: 'listening', interim: interimText });
        optionsRef.current.onInterim?.(interimText);
      }

      if (finalText.trim()) {
        setState({ status: 'listening', interim: '' });
        optionsRef.current.onResult?.(finalText);
      }
    };

    recognition.onerror = (event) => {
      lastEventAtRef.current = Date.now();

      // `no-speech` es lo normal cuando el candidato piensa: reportarlo como error
      // llenaría el log y la interfaz de avisos sin motivo.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      console.error('[useSTT] recognition error:', event.error);
      optionsRef.current.onError?.(event.error);
      setState({ status: 'error', error: event.error });
    };

    recognition.onend = () => {
      runningRef.current = false;

      // Solo se reinicia si el componente sigue queriendo escuchar. Sin esta
      // comprobación, `stop()` provocaría un arranque inmediato.
      if (shouldListenRef.current) {
        startRecognitionRef.current();
      } else {
        setState({ status: 'idle' });
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      runningRef.current = true;
      lastEventAtRef.current = Date.now();
      setState({ status: 'listening', interim: '' });
    } catch (error) {
      // `InvalidStateError` significa que el navegador ya lo tenía arrancado. No es un
      // fallo: se sincroniza la bandera y se sigue.
      console.warn('[useSTT] start failed:', error);
      runningRef.current = false;
    }
  }, [teardownRecognition]);

  // Mismo motivo que arriba: la asignación va en un efecto.
  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const start = useCallback(() => {
    shouldListenRef.current = true;
    startRecognition();

    if (watchdogRef.current) return;

    watchdogRef.current = setInterval(() => {
      if (!shouldListenRef.current) return;

      const silentFor = Date.now() - lastEventAtRef.current;

      // Dos casos de reinicio: la instancia se paró sola, o lleva demasiado tiempo sin
      // emitir nada con el micrófono abierto. El segundo es el que salva la respuesta
      // del candidato cuando el reconocimiento muere en silencio.
      if (!runningRef.current || silentFor > WATCHDOG_SILENCE_MS) {
        lastEventAtRef.current = Date.now();
        startRecognitionRef.current();
      }
    }, WATCHDOG_INTERVAL_MS);
  }, [startRecognition]);

  const stop = useCallback(() => {
    // La intención se marca ANTES de parar, para que `onend` no reinicie.
    shouldListenRef.current = false;

    if (watchdogRef.current) {
      clearInterval(watchdogRef.current);
      watchdogRef.current = null;
    }

    teardownRecognition();
    setState({ status: 'idle' });
  }, [teardownRecognition]);

  useEffect(() => stop, [stop]);

  return {
    state,
    isListening: state.status === 'listening',
    interim: state.status === 'listening' ? state.interim : '',
    start,
    stop,
    isSupported,
  };
}
