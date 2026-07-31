import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

describe('useUnsavedChangesWarning', () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    addSpy = vi.spyOn(window, 'addEventListener');
    removeSpy = vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Oyentes de `beforeunload` que se registraron. */
  const beforeunloadCalls = (spy: ReturnType<typeof vi.spyOn>): unknown[][] =>
    (spy.mock.calls as unknown[][]).filter((call) => call[0] === 'beforeunload');

  it('no registra nada cuando no hay cambios pendientes', () => {
    // No es una optimización cosmética: algunos navegadores descartan la caché de
    // retroceso-avance por la simple presencia de un `beforeunload`, así que registrarlo «por si
    // acaso» ralentiza la navegación de todo el mundo por un aviso que no toca mostrar.
    renderHook(() => useUnsavedChangesWarning(false));

    expect(beforeunloadCalls(addSpy)).toHaveLength(0);
  });

  it('registra el oyente cuando hay cambios pendientes', () => {
    renderHook(() => useUnsavedChangesWarning(true));

    expect(beforeunloadCalls(addSpy)).toHaveLength(1);
  });

  it('lo retira al desmontar', () => {
    const { unmount } = renderHook(() => useUnsavedChangesWarning(true));
    unmount();

    expect(beforeunloadCalls(removeSpy)).toHaveLength(1);
  });

  it('lo retira cuando los cambios se guardan', () => {
    const { rerender } = renderHook(
      ({ dirty }: { dirty: boolean }) => useUnsavedChangesWarning(dirty),
      { initialProps: { dirty: true } },
    );

    expect(beforeunloadCalls(addSpy)).toHaveLength(1);

    rerender({ dirty: false });

    expect(beforeunloadCalls(removeSpy)).toHaveLength(1);
  });

  it('cancela el evento con los dos mecanismos que hacen falta', () => {
    renderHook(() => useUnsavedChangesWarning(true));

    const handler = beforeunloadCalls(addSpy)[0][1] as (event: BeforeUnloadEvent) => void;

    // Se usa un evento SINTÉTICO en lugar de un `Event` real de jsdom.
    //
    // En jsdom, `Event.returnValue` es un booleano acoplado a `defaultPrevented`, mientras que en
    // un navegador `BeforeUnloadEvent.returnValue` es una cadena. Espiar `preventDefault` sobre un
    // `Event` real rompe además ese acoplamiento, así que la aserción acabaría comprobando el
    // modelo de jsdom en vez del contrato del handler, que es lo único que aquí es nuestro.
    const preventDefault = vi.fn();
    const event = { preventDefault, returnValue: undefined as unknown } as unknown as
      BeforeUnloadEvent;

    handler(event);

    // `preventDefault` es lo que pide la especificación actual; `returnValue` es lo que siguen
    // exigiendo algunos navegadores. Con uno solo, el aviso no sale en todas partes.
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe('');
  });

  it('no vuelve a registrar el oyente si el valor no cambia', () => {
    const { rerender } = renderHook(
      ({ dirty }: { dirty: boolean }) => useUnsavedChangesWarning(dirty),
      { initialProps: { dirty: true } },
    );

    rerender({ dirty: true });
    rerender({ dirty: true });

    expect(beforeunloadCalls(addSpy)).toHaveLength(1);
  });
});
