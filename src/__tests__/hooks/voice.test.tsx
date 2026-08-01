import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useTTS } from '@/hooks/useTTS';
import { useSTT } from '@/hooks/useSTT';

/**
 * Pruebas de voz: síntesis (Zara) y transcripción (candidato).
 *
 * QUÉ FIJAN
 * ---------
 * Las dos condiciones de carrera reales de la sala de entrevista:
 *
 *  1. **Dos voces simultáneas.** Si un turno nuevo empieza antes de que termine el
 *     anterior, el candidato oye a Zara hablando por encima de sí misma. `speak()` tiene
 *     que cancelar la locución previa, y una respuesta de `/api/tts` que llegue tarde
 *     tiene que descartarse en vez de ponerse a sonar.
 *
 *  2. **Reconocimiento muerto en silencio.** La API del navegador se detiene sola y no
 *     siempre avisa. Si nadie la reinicia, el candidato habla y nada se transcribe, sin
 *     ningún error. El vigilante tiene que reiniciarla, y `stop()` tiene que impedir que
 *     el reinicio ocurra después.
 *
 * Y fijan que ambos liberan sus recursos al desmontar, que es lo que evita que el audio
 * siga sonando o el micrófono siga abierto tras salir de la pantalla.
 */

/** Doble mínimo de `HTMLAudioElement` que permite disparar `ended` a mano. */
class FakeAudio {
  static instances: FakeAudio[] = [];

  src: string;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play = vi.fn(() => Promise.resolve());

  constructor(src: string) {
    this.src = src;
    FakeAudio.instances.push(this);
  }

  /** Simula el fin de la reproducción. */
  finish() {
    this.onended?.();
  }
}

let fetchMock: ReturnType<typeof vi.fn>;
let revokeMock: ReturnType<typeof vi.fn>;
let speechSynthesisCancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  FakeAudio.instances = [];

  // Se devuelve un objeto con `blob()` en vez de un `Response` real: el `Response` de
  // jsdom exige que el cuerpo implemente `stream()`, y un `Blob` de jsdom no siempre lo
  // hace. El hook solo llama a `response.ok` y `response.blob()`.
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    blob: async () => new Blob(['audio-falso'], { type: 'audio/mpeg' }),
  }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);

  vi.stubGlobal('Audio', FakeAudio as unknown as typeof Audio);

  // `URL` se ESPÍA, no se sustituye.
  //
  // El primer intento fue `vi.stubGlobal('URL', { ...URL, createObjectURL, ... })`, y
  // rompía todos los tests del archivo: los métodos estáticos de una clase no son
  // enumerables, así que el spread da `{}` y el global `URL` se quedaba sin constructor.
  // Cualquier `new URL(...)` —y jsdom hace varios al renderizar— fallaba, `renderHook`
  // devolvía `result.current === null` y los fallos no señalaban a la causa.
  //
  // jsdom no siempre define estos dos métodos, así que se crean antes de espiarlos.
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = () => 'blob:falso';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = () => {};
  }

  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:falso');
  revokeMock = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {}) as unknown as ReturnType<typeof vi.fn>;

  speechSynthesisCancel = vi.fn();
  vi.stubGlobal('speechSynthesis', {
    cancel: speechSynthesisCancel,
    // El doble tiene que DISPARAR `onend`.
    //
    // La primera versión era `speak: vi.fn()`, sin más. El respaldo de voz nativa de
    // `useTTS` espera la promesa que resuelve en `utterance.onend`, así que un `speak`
    // que no lo dispara deja el `await` colgado, el test agota los 5 s y el entorno queda
    // en un estado que hace fallar a TODOS los tests posteriores del archivo. Los fallos
    // aparecían en useSTT, que no tiene nada que ver: media hora de rastreo por un doble
    // incompleto.
    speak: vi.fn((utterance: { onend: (() => void) | null }) => {
      // Asíncrono, como el navegador real: llamarlo en línea resolvería la promesa antes
      // de que el hook haya terminado de instalar el manejador.
      queueMicrotask(() => utterance.onend?.());
    }),
    getVoices: () => [],
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      lang = '';
      rate = 1;
      pitch = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    },
  );

  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useTTS', () => {
  it('sintetiza, reproduce y resuelve al terminar el audio', async () => {
    const onStart = vi.fn();
    const onEnd = vi.fn();

    const { result } = renderHook(() => useTTS({ language: 'es', onStart, onEnd }));

    let speaking: Promise<void>;
    act(() => {
      speaking = result.current.speak('Hola, soy Zara.');
    });

    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledWith('/api/tts', expect.objectContaining({ method: 'POST' }));
    expect(onStart).toHaveBeenCalled();

    await act(async () => {
      FakeAudio.instances[0].finish();
      await speaking!;
    });

    expect(onEnd).toHaveBeenCalled();
    expect(result.current.isSpeaking).toBe(false);
  });

  it('envía el idioma configurado', async () => {
    const { result } = renderHook(() => useTTS({ language: 'es' }));

    act(() => {
      void result.current.speak('Hola');
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual({ text: 'Hola', language: 'es' });
  });

  it('revoca la URL de objeto al terminar', async () => {
    const { result } = renderHook(() => useTTS({ language: 'es' }));

    let speaking: Promise<void>;
    act(() => {
      speaking = result.current.speak('Hola');
    });

    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));

    await act(async () => {
      FakeAudio.instances[0].finish();
      await speaking!;
    });

    // La versión anterior la revocaba en tres sitios y ninguno cubría el fallo del fetch.
    expect(revokeMock).toHaveBeenCalledWith('blob:falso');
  });

  it('CANCELA la locución anterior al empezar otra', async () => {
    const { result } = renderHook(() => useTTS({ language: 'es' }));

    act(() => {
      void result.current.speak('Primera locución');
    });

    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));

    act(() => {
      void result.current.speak('Segunda locución');
    });

    // Sin esto, el candidato oye a Zara hablando por encima de sí misma. Es la condición
    // de carrera real de la sala.
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  });

  it('stop() corta la reproducción y la deja en reposo', async () => {
    const { result } = renderHook(() => useTTS({ language: 'es' }));

    act(() => {
      void result.current.speak('Hola');
    });

    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));

    act(() => {
      result.current.stop();
    });

    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
    expect(result.current.state.status).toBe('idle');
  });

  it('descarta una respuesta que llega DESPUÉS de un stop()', async () => {
    // Respuesta lenta, que llega cuando la locución ya se canceló.
    let releaseFetch: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    fetchMock.mockImplementation(async () => {
      await pending;
      return { ok: true, status: 200, blob: async () => new Blob(['tarde']) } as unknown as Response;
    });

    const { result } = renderHook(() => useTTS({ language: 'es' }));

    let speaking: Promise<void> = Promise.resolve();
    act(() => {
      speaking = result.current.speak('Hola');
    });

    act(() => {
      result.current.stop();
    });

    await act(async () => {
      releaseFetch();
      await speaking;
    });

    // Si no se descartara, el audio de un turno cancelado empezaría a sonar sobre el
    // siguiente: dos voces de Zara a la vez.
    expect(FakeAudio.instances).toHaveLength(0);
  });

  it('cae a la voz nativa cuando /api/tts falla, sin lanzar', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, blob: async () => new Blob([]) } as unknown as Response);

    const { result } = renderHook(() => useTTS({ language: 'es' }));

    let rejected = false;
    await act(async () => {
      await result.current.speak('Hola').catch(() => {
        rejected = true;
      });
    });

    // No rechaza: el llamante necesita continuar con la entrevista en cualquier caso.
    expect(rejected).toBe(false);
    // Y la entrevista no se queda muda.
    expect(speechSynthesisCancel).toHaveBeenCalled();
  });

  it('ignora un texto vacío sin llamar al proveedor', async () => {
    const { result } = renderHook(() => useTTS({ language: 'es' }));

    await act(async () => {
      await result.current.speak('   ');
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('libera el audio al desmontar', async () => {
    const { result, unmount } = renderHook(() => useTTS({ language: 'es' }));

    act(() => {
      void result.current.speak('Hola');
    });

    await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));

    unmount();

    // Sin esto, el turno en curso sigue sonando después de salir de la pantalla.
    expect(FakeAudio.instances[0].pause).toHaveBeenCalled();
  });
});

/** Doble de `SpeechRecognition` que permite disparar sus eventos. */
class FakeRecognition {
  static instances: FakeRecognition[] = [];

  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;

  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }

  /** Simula un resultado final. */
  emitFinal(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: Object.assign([[{ transcript: text }]], { length: 1, 0: Object.assign([{ transcript: text }], { isFinal: true, length: 1 }) }),
    });
  }

  /** Simula un resultado provisional. */
  emitInterim(text: string) {
    this.onresult?.({
      resultIndex: 0,
      results: Object.assign([], { length: 1, 0: Object.assign([{ transcript: text }], { isFinal: false, length: 1 }) }),
    });
  }
}

describe('useSTT', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    // El hook lee de `window`, así que se asigna ahí directamente. `vi.stubGlobal` no
    // sirve para esto: no restaura propiedades asignadas a mano, y por eso se restauran
    // en el `afterEach` de abajo. Sin ello, el test de «navegador sin soporte» —que las
    // pone a `undefined`— contaminaría a cualquiera que corriera después.
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = undefined;
  });

  afterEach(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it('usa el idioma configurado, no un inglés fijo', () => {
    // Es el bug que tenía `src/lib/stt.ts`: `recognition.lang = 'en-US'` sin parámetro,
    // en un producto cuyo idioma principal es el español. Los candidatos
    // hispanohablantes se transcribían con el modelo acústico inglés, y esa
    // transcripción degradada es la entrada de la evaluación.
    const { result } = renderHook(() => useSTT({ language: 'es' }));

    act(() => {
      result.current.start();
    });

    expect(FakeRecognition.instances[0].lang).toBe('es-ES');
  });

  it('usa en-US cuando el idioma es inglés', () => {
    const { result } = renderHook(() => useSTT({ language: 'en' }));

    act(() => {
      result.current.start();
    });

    expect(FakeRecognition.instances[0].lang).toBe('en-US');
  });

  it('entrega el texto final y el provisional por separado', () => {
    const onResult = vi.fn();
    const onInterim = vi.fn();

    const { result } = renderHook(() => useSTT({ language: 'es', onResult, onInterim }));

    act(() => {
      result.current.start();
    });

    act(() => {
      FakeRecognition.instances[0].emitInterim('estoy pens');
    });
    expect(onInterim).toHaveBeenCalledWith('estoy pens');

    act(() => {
      FakeRecognition.instances[0].emitFinal('estoy pensando en mi respuesta');
    });
    expect(onResult).toHaveBeenCalledWith('estoy pensando en mi respuesta');
  });

  it('reinicia solo si el componente sigue queriendo escuchar', () => {
    const { result } = renderHook(() => useSTT({ language: 'es' }));

    act(() => {
      result.current.start();
    });
    expect(FakeRecognition.instances).toHaveLength(1);

    // El navegador lo para solo tras un silencio. Sin reinicio, el candidato habla y nada
    // se transcribe, sin ningún error visible.
    act(() => {
      FakeRecognition.instances[0].onend?.();
    });
    expect(FakeRecognition.instances).toHaveLength(2);
  });

  it('NO reinicia después de stop()', () => {
    const { result } = renderHook(() => useSTT({ language: 'es' }));

    act(() => {
      result.current.start();
    });

    act(() => {
      result.current.stop();
    });

    const countAfterStop = FakeRecognition.instances.length;

    // Un `onend` tardío no debe resucitar el micrófono: `stop()` marca la intención
    // ANTES de parar precisamente por esto.
    act(() => {
      FakeRecognition.instances[countAfterStop - 1].onend?.();
    });

    expect(FakeRecognition.instances).toHaveLength(countAfterStop);
  });

  it('ignora no-speech, que es lo normal cuando el candidato piensa', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSTT({ language: 'es', onError }));

    act(() => {
      result.current.start();
    });

    act(() => {
      FakeRecognition.instances[0].onerror?.({ error: 'no-speech' });
    });

    // Reportarlo llenaría el log y la interfaz de avisos sin motivo.
    expect(onError).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('listening');
  });

  it('sí reporta un error real', () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useSTT({ language: 'es', onError }));

    act(() => {
      result.current.start();
    });

    act(() => {
      FakeRecognition.instances[0].onerror?.({ error: 'audio-capture' });
    });

    expect(onError).toHaveBeenCalledWith('audio-capture');
    expect(result.current.state).toEqual({ status: 'error', error: 'audio-capture' });
  });

  it('aborta el reconocimiento al desmontar', () => {
    const { result, unmount } = renderHook(() => useSTT({ language: 'es' }));

    act(() => {
      result.current.start();
    });

    unmount();

    // Sin esto el micrófono sigue abierto tras salir de la pantalla.
    expect(FakeRecognition.instances[0].abort).toHaveBeenCalled();
  });

  it('informa de navegador sin soporte', () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = undefined;
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = undefined;

    const { result } = renderHook(() => useSTT({ language: 'es' }));

    expect(result.current.isSupported).toBe(false);

    act(() => {
      result.current.start();
    });

    expect(result.current.state.status).toBe('unsupported');
  });
});
