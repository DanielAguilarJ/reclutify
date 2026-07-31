import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useMediaStream, classifyMediaStreamError } from '@/hooks/useMediaStream';
import {
  useMediaRecorder,
  resolveSupportedMimeType,
  extensionForMimeType,
} from '@/hooks/useMediaRecorder';

/**
 * Pruebas de los hooks de medios.
 *
 * QUÉ FIJAN, Y POR QUÉ ESO ES LO QUE IMPORTA
 * ------------------------------------------
 * La propiedad crítica de estos hooks no es lo que devuelven: es lo que LIBERAN. Una
 * pista de `MediaStream` sobrevive al componente que la pidió —el navegador no la cierra
 * al desmontar— así que el fallo real que se está previniendo es el LED de la cámara
 * encendido después de salir de una entrevista, es decir, seguir capturando cámara y
 * micrófono de alguien que ya se fue de la pantalla.
 *
 * Por eso la aserción que más vale aquí es `expect(track.stop).toHaveBeenCalled()` tras
 * `unmount()`, y está en varias formas: desmontaje directo, desmontaje sin haber llamado
 * a `stop()`, y cambio de dispositivo a mitad.
 */

/** Doble de una pista, con `stop` espiable. */
function fakeTrack(kind: 'video' | 'audio') {
  return { kind, stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
}

/** Doble de un `MediaStream` con las pistas dadas. */
function fakeStream(tracks: ReturnType<typeof fakeTrack>[]) {
  return { getTracks: () => tracks, id: 'fake-stream' } as unknown as MediaStream;
}

let getUserMediaMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  getUserMediaMock = vi.fn();

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia: getUserMediaMock },
    configurable: true,
    writable: true,
  });

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('classifyMediaStreamError', () => {
  it('distingue permiso denegado de dispositivo ocupado', () => {
    // No es un detalle cosmético: la instrucción al usuario es la OPUESTA. Revisar los
    // permisos del navegador no sirve de nada si el problema es que Zoom tiene la cámara.
    const denied = new Error('denied');
    denied.name = 'NotAllowedError';
    expect(classifyMediaStreamError(denied).kind).toBe('permission-denied');

    const busy = new Error('busy');
    busy.name = 'NotReadableError';
    expect(classifyMediaStreamError(busy).kind).toBe('device-in-use');
  });

  it('distingue dispositivo ausente y contexto no seguro', () => {
    const notFound = new Error('x');
    notFound.name = 'NotFoundError';
    expect(classifyMediaStreamError(notFound).kind).toBe('device-not-found');

    const insecure = new Error('x');
    insecure.name = 'SecurityError';
    expect(classifyMediaStreamError(insecure).kind).toBe('insecure-context');
  });

  it('cae a desconocido sin lanzar ante algo que no es un Error', () => {
    expect(classifyMediaStreamError('texto suelto').kind).toBe('unknown');
    expect(classifyMediaStreamError(null).kind).toBe('unknown');
  });
});

describe('useMediaStream', () => {
  it('abre el flujo y expone el estado', async () => {
    const tracks = [fakeTrack('video'), fakeTrack('audio')];
    getUserMediaMock.mockResolvedValue(fakeStream(tracks));

    const { result } = renderHook(() => useMediaStream());

    expect(result.current.state.status).toBe('idle');

    await act(async () => {
      await result.current.request();
    });

    expect(result.current.state.status).toBe('ready');
    expect(result.current.stream).not.toBeNull();
  });

  it('DETIENE las pistas al desmontar, aunque nadie llame a stop()', async () => {
    const tracks = [fakeTrack('video'), fakeTrack('audio')];
    getUserMediaMock.mockResolvedValue(fakeStream(tracks));

    const { result, unmount } = renderHook(() => useMediaStream());

    await act(async () => {
      await result.current.request();
    });

    tracks.forEach((track) => expect(track.stop).not.toHaveBeenCalled());

    unmount();

    // ESTA es la aserción que importa. Sin ella, el LED de la cámara se queda encendido
    // al navegar fuera de la entrevista.
    tracks.forEach((track) => expect(track.stop).toHaveBeenCalledTimes(1));
  });

  it('detiene el flujo anterior al pedir otro, para no acumular capturas', async () => {
    const first = [fakeTrack('video')];
    const second = [fakeTrack('video')];

    getUserMediaMock
      .mockResolvedValueOnce(fakeStream(first))
      .mockResolvedValueOnce(fakeStream(second));

    const { result } = renderHook(() => useMediaStream());

    await act(async () => {
      await result.current.request();
    });
    await act(async () => {
      await result.current.request();
    });

    // Cambiar de cámara sin esto dejaba la anterior capturando.
    expect(first[0].stop).toHaveBeenCalledTimes(1);
    expect(second[0].stop).not.toHaveBeenCalled();
  });

  it('stop() es idempotente', async () => {
    const tracks = [fakeTrack('video')];
    getUserMediaMock.mockResolvedValue(fakeStream(tracks));

    const { result } = renderHook(() => useMediaStream());

    await act(async () => {
      await result.current.request();
    });

    act(() => {
      result.current.stop();
      result.current.stop();
      result.current.stop();
    });

    // Llamarla de más no debe romper nada; no llamarla es lo que rompe.
    expect(tracks[0].stop).toHaveBeenCalledTimes(1);
  });

  it('expone el motivo del fallo sin lanzar', async () => {
    const denied = new Error('denied');
    denied.name = 'NotAllowedError';
    getUserMediaMock.mockRejectedValue(denied);

    const { result } = renderHook(() => useMediaStream());

    let returned: MediaStream | null = null;
    await act(async () => {
      returned = await result.current.request();
    });

    // Devuelve `null` en vez de lanzar: el llamante está en un manejador de evento y una
    // excepción ahí deja la interfaz a medias.
    expect(returned).toBeNull();
    expect(result.current.state).toEqual({
      status: 'error',
      error: { kind: 'permission-denied', name: 'NotAllowedError' },
    });
  });

  it('pide el dispositivo exacto cuando el usuario eligió uno', async () => {
    getUserMediaMock.mockResolvedValue(fakeStream([fakeTrack('video')]));

    const { result } = renderHook(() => useMediaStream({ cameraId: 'cam-1', microphoneId: 'mic-1' }));

    await act(async () => {
      await result.current.request();
    });

    // Sin `exact`, el navegador puede ignorar la preferencia y abrir otro dispositivo sin
    // error: el usuario ve una cámara que no es la que seleccionó.
    expect(getUserMediaMock).toHaveBeenCalledWith({
      video: { deviceId: { exact: 'cam-1' } },
      audio: { deviceId: { exact: 'mic-1' } },
    });
  });

  it('informa de navegador sin soporte en lugar de reventar', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useMediaStream());

    await act(async () => {
      await result.current.request();
    });

    expect(result.current.state).toEqual({
      status: 'error',
      error: { kind: 'unsupported', name: 'NoMediaDevices' },
    });
  });
});

describe('resolveSupportedMimeType', () => {
  afterEach(() => {
    // @ts-expect-error se restaura el global simulado
    delete globalThis.MediaRecorder;
  });

  it('elige el primer tipo soportado por orden de preferencia', () => {
    // VP9 comprime mejor que VP8, así que va primero.
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: { isTypeSupported: (type: string) => type.includes('vp8') || type === 'video/webm' },
      configurable: true,
      writable: true,
    });

    expect(resolveSupportedMimeType()).toBe('video/webm;codecs=vp8,opus');
  });

  it('cae a mp4 cuando WebM no está soportado', () => {
    // Es el caso de Safari. Asumir `video/webm` producía una grabación vacía sin error.
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: { isTypeSupported: (type: string) => type === 'video/mp4' },
      configurable: true,
      writable: true,
    });

    expect(resolveSupportedMimeType()).toBe('video/mp4');
  });

  it('devuelve null si no hay MediaRecorder', () => {
    expect(resolveSupportedMimeType()).toBeNull();
  });
});

describe('extensionForMimeType', () => {
  it('deriva la extensión del tipo, incluidos los que llevan códecs', () => {
    expect(extensionForMimeType('video/webm;codecs=vp9,opus')).toBe('webm');
    expect(extensionForMimeType('video/mp4')).toBe('mp4');
    // La extensión decide la clave del objeto en R2, y la ruta solo acepta `webm` y
    // `mp4`, así que cualquier otra cosa tiene que caer en una de las dos.
    expect(extensionForMimeType('video/x-desconocido')).toBe('webm');
  });
});

describe('useMediaRecorder', () => {
  /** Doble de `MediaRecorder` que registra las llamadas al ciclo de vida. */
  function installFakeRecorder() {
    const instances: Array<{
      state: string;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
      mimeType: string;
      onstop: (() => void) | null;
      ondataavailable: ((event: { data: Blob }) => void) | null;
      onerror: ((event: unknown) => void) | null;
    }> = [];

    class FakeRecorder {
      state = 'inactive';
      mimeType: string;
      onstop: (() => void) | null = null;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      start = vi.fn(() => {
        this.state = 'recording';
      });

      stop = vi.fn(() => {
        this.state = 'inactive';
        this.onstop?.();
      });

      constructor(_stream: MediaStream, options: { mimeType: string }) {
        this.mimeType = options.mimeType;
        instances.push(this as unknown as (typeof instances)[number]);
      }

      static isTypeSupported = () => true;
    }

    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: FakeRecorder,
      configurable: true,
      writable: true,
    });

    return instances;
  }

  afterEach(() => {
    // @ts-expect-error se restaura el global simulado
    delete globalThis.MediaRecorder;
  });

  it('arranca y marca el estado', () => {
    const instances = installFakeRecorder();
    const { result } = renderHook(() => useMediaRecorder());

    act(() => {
      result.current.start(fakeStream([fakeTrack('video')]));
    });

    expect(result.current.isRecording).toBe(true);
    expect(instances[0].start).toHaveBeenCalledWith(1_000);
  });

  it('resuelve stop() con el blob y VACÍA los fragmentos', async () => {
    const instances = installFakeRecorder();
    const { result } = renderHook(() => useMediaRecorder());

    act(() => {
      result.current.start(fakeStream([fakeTrack('video')]));
    });

    act(() => {
      instances[0].ondataavailable?.({ data: new Blob(['abc'], { type: 'video/webm' }) });
    });

    let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      recording = await result.current.stop();
    });

    expect(recording).not.toBeNull();
    expect(recording!.blob.size).toBeGreaterThan(0);
    expect(result.current.isRecording).toBe(false);

    // Una segunda llamada no debe reencontrar los fragmentos anteriores: un array de
    // `Blob` de vídeo es el objeto más grande de esta pantalla.
    let second: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      second = await result.current.stop();
    });
    expect(second).toBeNull();
  });

  it('descarta los fragmentos vacíos que emite el navegador', async () => {
    const instances = installFakeRecorder();
    const { result } = renderHook(() => useMediaRecorder());

    act(() => {
      result.current.start(fakeStream([fakeTrack('video')]));
    });

    act(() => {
      instances[0].ondataavailable?.({ data: new Blob([], { type: 'video/webm' }) });
    });

    let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      recording = await result.current.stop();
    });

    // Sin fragmentos reales no hay grabación: devolver un blob vacío haría que se subiera
    // un vídeo de 0 bytes y el informe mostraría un reproductor roto.
    expect(recording).toBeNull();
  });

  it('DETIENE la grabadora al desmontar y quita su onstop', () => {
    const instances = installFakeRecorder();
    const { result, unmount } = renderHook(() => useMediaRecorder());

    act(() => {
      result.current.start(fakeStream([fakeTrack('video')]));
    });

    unmount();

    expect(instances[0].stop).toHaveBeenCalled();
    // El `onstop` se quita ANTES de parar: si quedara puesto, dispararía una subida
    // huérfana sobre un componente que ya no existe.
    expect(instances[0].onstop).toBeNull();
  });

  it('informa de error si el navegador no soporta MediaRecorder', () => {
    const { result } = renderHook(() => useMediaRecorder());

    let started = true;
    act(() => {
      started = result.current.start(fakeStream([fakeTrack('video')]));
    });

    expect(started).toBe(false);
    expect(result.current.state.status).toBe('error');
  });

  it('stop() sin grabación previa resuelve null sin lanzar', async () => {
    installFakeRecorder();
    const { result } = renderHook(() => useMediaRecorder());

    let recording: Awaited<ReturnType<typeof result.current.stop>> = null;
    await act(async () => {
      recording = await result.current.stop();
    });

    expect(recording).toBeNull();
  });
});
