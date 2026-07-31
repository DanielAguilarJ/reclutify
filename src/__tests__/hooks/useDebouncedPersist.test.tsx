import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedPersist } from '@/hooks/useDebouncedPersist';

describe('useDebouncedPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no escribe hasta que dejan de llegar valores', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 500));

    act(() => {
      result.current.schedule('mod-1:title', 'M');
      result.current.schedule('mod-1:title', 'Mó');
      result.current.schedule('mod-1:title', 'Mód');
    });

    expect(persist).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Una sola escritura, con lo último. Antes eran tres peticiones al servidor.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('mod-1:title', 'Mód');
  });

  it('cada clave tiene su propio temporizador', () => {
    // Es la razón de que el hook sea por clave: con un temporizador único, pasar del título del
    // módulo A al del B cancelaría el guardado de A y la edición se perdería en silencio.
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 500));

    act(() => {
      result.current.schedule('mod-a:title', 'Título A');
      vi.advanceTimersByTime(300);
      result.current.schedule('mod-b:title', 'Título B');
      vi.advanceTimersByTime(200);
    });

    // A venció mientras B seguía esperando.
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('mod-a:title', 'Título A');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist).toHaveBeenLastCalledWith('mod-b:title', 'Título B');
  });

  it('campos distintos del mismo módulo no se cancelan entre sí', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 500));

    act(() => {
      result.current.schedule('mod-1:title', 'Un título');
      result.current.schedule('mod-1:description', 'Una descripción');
      vi.advanceTimersByTime(500);
    });

    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('`flush` emite ya lo pendiente de una clave', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 5000));

    act(() => {
      result.current.schedule('mod-1:title', 'Listo');
      result.current.flush('mod-1:title');
    });

    expect(persist).toHaveBeenCalledWith('mod-1:title', 'Listo');

    // Y el temporizador queda cancelado: no se escribe dos veces.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('`flush` de una clave sin nada pendiente no escribe', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 500));

    act(() => {
      result.current.flush('inexistente');
    });

    expect(persist).not.toHaveBeenCalled();
  });

  it('`flushAll` emite todo lo pendiente', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 5000));

    act(() => {
      result.current.schedule('a:title', '1');
      result.current.schedule('b:title', '2');
      result.current.schedule('c:title', '3');
      result.current.flushAll();
    });

    expect(persist).toHaveBeenCalledTimes(3);
  });

  it('`cancel` descarta sin escribir', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist<string>(persist, 500));

    act(() => {
      result.current.schedule('mod-1:title', 'se va a borrar');
      result.current.cancel('mod-1:title');
      vi.advanceTimersByTime(500);
    });

    expect(persist).not.toHaveBeenCalled();
  });

  it('al desmontar EMITE lo pendiente en vez de descartarlo', () => {
    // Es la decisión menos obvia del hook. Descartar perdería la última edición de quien escribe y
    // navega antes de que venza el retardo — un caso que este hook introduce y antes no existía,
    // porque con una petición por tecla lo escrito ya estaba guardado.
    const persist = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedPersist<string>(persist, 5000));

    act(() => {
      result.current.schedule('mod-1:title', 'sin guardar');
    });
    expect(persist).not.toHaveBeenCalled();

    unmount();

    expect(persist).toHaveBeenCalledWith('mod-1:title', 'sin guardar');
  });

  it('no escribe nada al desmontar si no quedaba nada pendiente', () => {
    const persist = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedPersist<string>(persist, 500));

    act(() => {
      result.current.schedule('mod-1:title', 'guardado');
      vi.advanceTimersByTime(500);
    });
    expect(persist).toHaveBeenCalledTimes(1);

    unmount();

    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('usa la última versión de `persist` sin reiniciar el temporizador', () => {
    // `persist` es una función nueva en cada renderizado del padre. Si el hook dependiera de su
    // identidad, cada renderizado reiniciaría la cuenta y el retardo no vencería nunca mientras se
    // teclea, que es exactamente cuando el padre re-renderiza.
    const first = vi.fn();
    const second = vi.fn();

    const { result, rerender } = renderHook(
      ({ fn }: { fn: (key: string, value: string) => void }) => useDebouncedPersist(fn, 500),
      { initialProps: { fn: first as (key: string, value: string) => void } },
    );

    act(() => {
      result.current.schedule('k', 'v');
      vi.advanceTimersByTime(300);
    });

    rerender({ fn: second as (key: string, value: string) => void });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('k', 'v');
  });

  it('`schedule` mantiene su identidad entre renderizados', () => {
    const { result, rerender } = renderHook(() => useDebouncedPersist<string>(() => {}, 500));
    const firstSchedule = result.current.schedule;

    rerender();

    expect(result.current.schedule).toBe(firstSchedule);
  });
});
