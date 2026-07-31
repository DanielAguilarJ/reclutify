'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Adquisición y liberación de cámara y micrófono.
 *
 * POR QUÉ EXISTE
 * --------------
 * `InterviewRoom`, `HardwareCheck` y `QuickDeviceSetup` piden los mismos permisos, con
 * las mismas restricciones y traducen los mismos errores de `DOMException`. Cada uno
 * tenía su copia, y las tres diferían: `HardwareCheck` y `QuickDeviceSetup` sí liberan
 * las pistas al desmontar, `InterviewRoom` solo lo hacía al terminar la entrevista.
 *
 * Esa diferencia es la que dejaba el LED de la cámara encendido al navegar fuera de una
 * entrevista en curso. Con el ciclo de vida en un hook, liberar deja de ser algo que
 * cada componente tiene que acordarse de hacer.
 *
 * LA REGLA QUE ENCAPSULA
 * ----------------------
 * **Una pista de `MediaStream` sobrevive al componente que la pidió.** El navegador no
 * la libera al desmontar: sigue capturando hasta que alguien llama a `track.stop()`.
 * Por eso el `useEffect` de este hook devuelve siempre un cleanup que las detiene, y
 * por eso `stop()` es idempotente: llamarla dos veces no rompe nada, y no llamarla es
 * lo que rompe.
 */

/** Motivo por el que no se pudo obtener el flujo. */
export type MediaStreamErrorKind =
  | 'permission-denied'
  | 'device-not-found'
  | 'device-in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

export interface MediaStreamError {
  kind: MediaStreamErrorKind;
  /** Nombre de la `DOMException`, para el log. No se muestra al usuario. */
  name: string;
}

/** Estado del flujo. Discriminado: no hay combinaciones imposibles. */
export type MediaStreamState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'ready'; stream: MediaStream }
  | { status: 'error'; error: MediaStreamError };

export interface UseMediaStreamOptions {
  /** `deviceId` de la cámara, si el usuario eligió una. */
  cameraId?: string | null;
  /** `deviceId` del micrófono, si el usuario eligió uno. */
  microphoneId?: string | null;
  /** Pedir vídeo. Por defecto sí. */
  video?: boolean;
  /** Pedir audio. Por defecto sí. */
  audio?: boolean;
}

/**
 * Traduce el fallo de `getUserMedia` a un motivo accionable.
 *
 * Los nombres de `DOMException` son la única señal fiable de qué pasó, y cada uno pide
 * una instrucción distinta al usuario: revisar permisos del navegador no sirve si el
 * problema es que otra aplicación tiene la cámara ocupada.
 */
export function classifyMediaStreamError(error: unknown): MediaStreamError {
  const name = error instanceof Error ? error.name : 'UnknownError';

  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { kind: 'permission-denied', name };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { kind: 'device-not-found', name };
    case 'NotReadableError':
    case 'TrackStartError':
      // Otra aplicación tiene el dispositivo. Es el caso que más se confunde con un
      // problema de permisos, y la instrucción correcta es la opuesta.
      return { kind: 'device-in-use', name };
    case 'SecurityError':
      return { kind: 'insecure-context', name };
    case 'TypeError':
      // `getUserMedia` no existe: contexto no seguro o navegador sin soporte.
      return { kind: 'unsupported', name };
    default:
      return { kind: 'unknown', name };
  }
}

/**
 * Construye las restricciones.
 *
 * `deviceId` va como `exact` cuando el usuario eligió un dispositivo: sin `exact`, el
 * navegador puede ignorar la preferencia y abrir otro, y el usuario ve una cámara que
 * no es la que seleccionó sin ningún error de por medio.
 */
function buildConstraints(options: UseMediaStreamOptions): MediaStreamConstraints {
  const wantsVideo = options.video !== false;
  const wantsAudio = options.audio !== false;

  return {
    video: wantsVideo
      ? options.cameraId
        ? { deviceId: { exact: options.cameraId } }
        : true
      : false,
    audio: wantsAudio
      ? options.microphoneId
        ? { deviceId: { exact: options.microphoneId } }
        : true
      : false,
  };
}

export interface UseMediaStreamResult {
  state: MediaStreamState;
  /** El flujo activo, o `null`. Atajo de `state`. */
  stream: MediaStream | null;
  /**
   * Pide los permisos y abre el flujo.
   *
   * Si ya hay uno abierto lo detiene antes: sin eso, cambiar de cámara acumulaba
   * flujos y el LED del dispositivo anterior seguía encendido.
   */
  request: () => Promise<MediaStream | null>;
  /** Detiene todas las pistas. Idempotente. */
  stop: () => void;
}

/**
 * Gestiona un `MediaStream` de cámara y micrófono.
 *
 * @example
 * const { stream, state, request, stop } = useMediaStream({ cameraId });
 * // El flujo se libera al desmontar sin que el componente haga nada.
 */
export function useMediaStream(options: UseMediaStreamOptions = {}): UseMediaStreamResult {
  const [state, setState] = useState<MediaStreamState>({ status: 'idle' });

  // El flujo vive en un ref además del estado porque el cleanup del desmontaje tiene
  // que alcanzarlo, y para entonces el estado ya no es accesible.
  const streamRef = useRef<MediaStream | null>(null);

  // Las opciones se leen en un ref para que `request` sea estable: si dependiera de
  // `options`, cambiaría en cada render y arrastraría a todo efecto que la use.
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

  const stop = useCallback(() => {
    const current = streamRef.current;
    if (!current) return;

    // Se detiene pista por pista: `MediaStream` no tiene un `stop()` propio, y soltar
    // la referencia no libera el dispositivo.
    current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const request = useCallback(async (): Promise<MediaStream | null> => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setState({ status: 'error', error: { kind: 'unsupported', name: 'NoMediaDevices' } });
      return null;
    }

    // Un flujo anterior se cierra antes de pedir otro. Sin esto, cambiar de dispositivo
    // deja el primero capturando.
    stop();

    setState({ status: 'requesting' });

    try {
      const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(optionsRef.current));
      streamRef.current = stream;
      setState({ status: 'ready', stream });
      return stream;
    } catch (error) {
      const classified = classifyMediaStreamError(error);
      console.error('[useMediaStream] getUserMedia failed:', classified.name);
      setState({ status: 'error', error: classified });
      return null;
    }
  }, [stop]);

  // El cleanup es el punto de todo el hook: se ejecuta SIEMPRE al desmontar, así que el
  // componente no puede olvidarse de liberar cámara y micrófono.
  useEffect(() => stop, [stop]);

  return {
    state,
    stream: state.status === 'ready' ? state.stream : null,
    request,
    stop,
  };
}
