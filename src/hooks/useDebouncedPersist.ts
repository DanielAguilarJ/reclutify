import { useCallback, useEffect, useRef } from 'react';

/**
 * Agrupa escrituras por clave y las emite cuando dejan de llegar.
 *
 * QUÉ PROBLEMA RESUELVE
 * ---------------------
 * Los campos de texto de la configuración de programas de formación llamaban al servidor en cada
 * pulsación de tecla: escribir «Módulo de introducción» disparaba veintitantos `PATCH`. Y como no
 * se cancelaban ni se ordenaban, la petición de «Módulo de intro» podía llegar DESPUÉS de la de
 * «Módulo de introducción» y dejar en la base de datos el texto a medias.
 *
 * POR QUÉ POR CLAVE Y NO UN ÚNICO TEMPORIZADOR
 * --------------------------------------------
 * Con un solo temporizador, editar el título del módulo A y pasar al del módulo B cancelaría el
 * guardado de A: la edición se perdería sin que nadie lo notara. La clave identifica el destino
 * —`${moduleId}:${campo}`— así que cada campo tiene su propio temporizador y ninguno cancela a
 * otro.
 *
 * SE EMITE LO ÚLTIMO, NO LO PRIMERO
 * ---------------------------------
 * Al vencer el retardo se envía el valor más reciente de esa clave. Para un campo de texto es lo
 * correcto: lo que el usuario quiere guardar es lo que dejó escrito, no la primera letra.
 */

/** Retardo por defecto: suficiente para una pausa al teclear, corto para no perder trabajo. */
export const DEFAULT_PERSIST_DELAY_MS = 600;

export interface UseDebouncedPersistResult<T> {
  /** Programa el guardado de `value` para `key`, reemplazando lo que hubiera pendiente. */
  schedule: (key: string, value: T) => void;
  /** Emite ya lo pendiente de `key`, si hay algo. Para `onBlur` o antes de guardar todo. */
  flush: (key: string) => void;
  /** Emite ya todo lo pendiente. Para el botón de guardar. */
  flushAll: () => void;
  /** Descarta lo pendiente de `key` sin emitirlo. Para cuando se borra el destino. */
  cancel: (key: string) => void;
}

/**
 * @param persist Efecto que escribe de verdad. Recibe la clave y el último valor.
 * @param delayMs Milisegundos de inactividad antes de emitir.
 */
export function useDebouncedPersist<T>(
  persist: (key: string, value: T) => void,
  delayMs: number = DEFAULT_PERSIST_DELAY_MS,
): UseDebouncedPersistResult<T> {
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pending = useRef(new Map<string, T>());

  // `persist` suele ser una función nueva en cada renderizado. Se guarda en un ref para que
  // `schedule` sea estable y no reinicie los temporizadores en cada renderizado del padre, que es
  // precisamente lo que haría que el retardo nunca venciera mientras se teclea.
  const persistRef = useRef(persist);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  const emit = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(key);
    }

    if (!pending.current.has(key)) return;

    const value = pending.current.get(key) as T;
    pending.current.delete(key);
    persistRef.current(key, value);
  }, []);

  const schedule = useCallback(
    (key: string, value: T) => {
      pending.current.set(key, value);

      const existing = timers.current.get(key);
      if (existing !== undefined) clearTimeout(existing);

      timers.current.set(
        key,
        setTimeout(() => emit(key), delayMs),
      );
    },
    [delayMs, emit],
  );

  const flush = useCallback((key: string) => emit(key), [emit]);

  const flushAll = useCallback(() => {
    for (const key of Array.from(pending.current.keys())) emit(key);
  }, [emit]);

  const cancel = useCallback((key: string) => {
    const timer = timers.current.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(key);
    }
    pending.current.delete(key);
  }, []);

  // Al desmontar se EMITE lo pendiente, no se descarta.
  //
  // Es la decisión menos obvia del módulo. Descartar sería más simple y perdería la última edición
  // de quien escribe y navega antes de que venza el retardo, que es justo el caso que este hook
  // introduce y antes no existía: con un `PATCH` por tecla, lo escrito ya estaba guardado.
  //
  // Se lee el ref directamente en lugar de llamar a `flushAll` para no depender de su identidad y
  // que el efecto no se vuelva a ejecutar.
  useEffect(() => {
    const timersMap = timers.current;
    const pendingMap = pending.current;

    return () => {
      for (const timer of timersMap.values()) clearTimeout(timer);
      timersMap.clear();

      for (const [key, value] of pendingMap.entries()) {
        persistRef.current(key, value);
      }
      pendingMap.clear();
    };
  }, []);

  return { schedule, flush, flushAll, cancel };
}
