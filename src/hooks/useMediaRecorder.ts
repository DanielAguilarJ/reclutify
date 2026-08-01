'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Grabación de la entrevista con `MediaRecorder`.
 *
 * POR QUÉ EXISTE
 * --------------
 * `InterviewRoom` gestionaba la grabadora a mano y solo la detenía en `endInterview()`.
 * Si el componente se desmontaba por navegación, la grabadora seguía activa y los
 * fragmentos —decenas de megabytes de vídeo— quedaban retenidos en un ref que nadie
 * vaciaba.
 *
 * LO QUE ESTE HOOK GARANTIZA Y EL CÓDIGO ANTERIOR NO
 * --------------------------------------------------
 *  1. **Detención al desmontar**, siempre.
 *  2. **Los fragmentos se vacían** al detener, no solo la referencia al blob. Un array
 *     de `Blob` de vídeo es el objeto más grande que maneja esta pantalla.
 *  3. **`stop()` devuelve una promesa** que resuelve con el blob. La versión anterior
 *     asignaba `onstop` a mano justo antes de llamar a `stop()`, lo que acopla el orden
 *     de las dos operaciones: si algo entre medias volvía a asignar `onstop`, la subida
 *     se perdía en silencio.
 *  4. **El tipo MIME se negocia** con `isTypeSupported` en vez de asumir `video/webm`.
 *     Safari no lo soporta y producía una grabación vacía sin error.
 */

/** Estado de la grabación. Discriminado. */
export type MediaRecorderState =
  | { status: 'idle' }
  | { status: 'recording'; startedAt: number }
  | { status: 'stopping' }
  | { status: 'error'; message: string };

/** Resultado de una grabación terminada. */
export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  /** Duración aproximada en milisegundos. */
  durationMs: number;
}

/**
 * Tipos MIME en orden de preferencia.
 *
 * El orden importa: VP9 comprime mejor que VP8, y `video/mp4` va al final porque solo
 * lo necesita Safari, que no soporta WebM. `isTypeSupported` decide; asumir uno era la
 * causa de que la grabación saliera vacía en Safari sin ningún error visible.
 */
const PREFERRED_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
] as const;

/** Primer tipo MIME soportado por el navegador, o `null`. */
export function resolveSupportedMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;

  return (
    PREFERRED_MIME_TYPES.find((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    }) ?? null
  );
}

/** Extensión de fichero que corresponde a un tipo MIME. */
export function extensionForMimeType(mimeType: string): 'webm' | 'mp4' {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
}

export interface UseMediaRecorderResult {
  state: MediaRecorderState;
  isRecording: boolean;
  /** Arranca la grabación sobre el flujo dado. */
  start: (stream: MediaStream) => boolean;
  /**
   * Detiene y resuelve con el resultado.
   *
   * Resuelve `null` si no había nada grabando o si no se capturó ni un fragmento.
   */
  stop: () => Promise<RecordingResult | null>;
  /** Descarta la grabación sin producir resultado. Para el desmontaje. */
  discard: () => void;
}

/**
 * Graba un `MediaStream` a un blob.
 *
 * @example
 * const recorder = useMediaRecorder();
 * recorder.start(stream);
 * const result = await recorder.stop();   // { blob, mimeType, durationMs }
 */
export function useMediaRecorder(): UseMediaRecorderResult {
  const [state, setState] = useState<MediaRecorderState>({ status: 'idle' });

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);

  /**
   * Suelta la grabadora y los fragmentos.
   *
   * Quita los manejadores ANTES de parar: si no, el `onstop` que instaló un `stop()`
   * pendiente se dispararía sobre un componente que ya no existe.
   */
  const release = useCallback(() => {
    const recorder = recorderRef.current;

    if (recorder) {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      recorder.onerror = null;

      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // Una grabadora ya inactiva lanza al pararla; es el estado buscado.
      }
    }

    recorderRef.current = null;
    // Los fragmentos son el objeto grande: sin vaciarlos, el vídeo entero queda
    // retenido hasta que el recolector alcance el componente.
    chunksRef.current = [];
  }, []);

  const start = useCallback((stream: MediaStream): boolean => {
    const mimeType = resolveSupportedMimeType();

    if (!mimeType) {
      const message = 'MediaRecorder is not supported in this browser';
      console.error(`[useMediaRecorder] ${message}`);
      setState({ status: 'error', message });
      return false;
    }

    // Una grabadora anterior se suelta antes de crear otra, para no dejarla corriendo
    // sin referencia.
    release();

    try {
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        // El navegador emite fragmentos vacíos entre keyframes; guardarlos infla el
        // array sin aportar datos.
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = (event) => {
        // La versión anterior solo hacía `console.error` aquí, así que una grabación
        // fallida se descubría al final, cuando el vídeo no aparecía en el informe.
        console.error('[useMediaRecorder] recorder error:', event);
        setState({ status: 'error', message: 'Recording failed' });
      };

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      chunksRef.current = [];

      // Un fragmento por segundo: si la pestaña muere a mitad, se conserva lo grabado
      // hasta el último segundo en vez de perderlo todo.
      recorder.start(1_000);
      setState({ status: 'recording', startedAt: startedAtRef.current });

      return true;
    } catch (error) {
      console.error('[useMediaRecorder] failed to start:', error);
      setState({ status: 'error', message: 'Could not start recording' });
      return false;
    }
  }, [release]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === 'inactive') {
      release();
      setState({ status: 'idle' });
      return Promise.resolve(null);
    }

    setState({ status: 'stopping' });

    // La promesa se resuelve desde `onstop`, que es el único momento en que el
    // navegador garantiza que ya emitió todos los fragmentos. Devolverla evita que el
    // llamante tenga que instalar `onstop` por su cuenta justo antes de `stop()`, que
    // era el acoplamiento frágil de la versión anterior.
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'video/webm';
        const chunks = chunksRef.current;
        const blob = chunks.length > 0 ? new Blob(chunks, { type: mimeType }) : null;
        const durationMs = Date.now() - startedAtRef.current;

        // Se vacía ANTES de resolver: el llamante ya tiene el blob, y así los
        // fragmentos no siguen ocupando memoria mientras se sube.
        chunksRef.current = [];
        recorderRef.current = null;
        setState({ status: 'idle' });

        resolve(blob ? { blob, mimeType, durationMs } : null);
      };

      try {
        recorder.stop();
      } catch (error) {
        console.error('[useMediaRecorder] stop failed:', error);
        release();
        setState({ status: 'idle' });
        resolve(null);
      }
    });
  }, [release]);

  // Al desmontar se descarta: no hay a quién entregar el resultado, y dejar la
  // grabadora activa mantiene ocupadas las pistas del flujo.
  useEffect(() => release, [release]);

  return {
    state,
    isRecording: state.status === 'recording',
    start,
    stop,
    discard: release,
  };
}
