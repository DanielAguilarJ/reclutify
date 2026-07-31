'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Comportamiento accesible de un diálogo modal.
 *
 * QUÉ FALTABA EN LOS SEIS MODALES DEL PROYECTO
 * --------------------------------------------
 * `HireModal`, `CompareModal`, `ReportModal`, `JobDetailModal`, el menú móvil de la
 * landing y el panel de notificaciones se pintaban como un `div` con posición fija sobre
 * un fondo oscurecido. Ninguno tenía `role="dialog"`, `aria-modal`, trampa de foco ni
 * cierre con Escape. Las consecuencias, en orden de gravedad:
 *
 *  1. **El foco se queda detrás.** Al abrir, el foco sigue en el documento de fondo, así
 *     que quien navega con teclado tabula por los enlaces de la página que el modal está
 *     tapando. No hay forma de saber dónde está el cursor.
 *  2. **No se puede cerrar sin ratón.** El único cierre era pulsar la X o el fondo.
 *  3. **El lector de pantalla no anuncia nada.** Sin `role="dialog"` el contenido
 *     aparece como texto suelto en medio del documento, sin indicar que algo se abrió.
 *  4. **Al cerrar, el foco se pierde.** Vuelve al principio del documento en vez de al
 *     botón que abrió el modal, así que el usuario tiene que recorrer la página otra vez.
 *
 * Los cuatro los resuelve este hook, que es uno solo para los seis: la alternativa era
 * repetir la misma lógica de teclado seis veces y que divergiera.
 *
 * POR QUÉ NO SE USA `<dialog>` NATIVO
 * -----------------------------------
 * `HTMLDialogElement.showModal()` daría la trampa de foco y el Escape gratis, pero los
 * seis modales están animados con Framer Motion y montados condicionalmente dentro de un
 * `AnimatePresence`. `<dialog>` gestiona su propia visibilidad con el atributo `open`, lo
 * que choca con el desmontaje animado: el elemento desaparece antes de que la animación
 * de salida termine. Migrar exigiría reescribir las animaciones de los seis, así que se
 * implementa el comportamiento sobre el marcado que ya existe.
 */

/**
 * Selector de los elementos que pueden recibir foco.
 *
 * `[tabindex]:not([tabindex="-1"])` incluye los elementos que se hicieron enfocables a
 * mano; excluir `-1` es necesario porque ese valor significa «enfocable por programa,
 * pero no con Tab».
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
]
  // `:not([hidden])` y `:not([aria-hidden="true"])` se aplican a TODOS los candidatos.
  //
  // La primera versión filtraba después con `element.offsetParent !== null`, y era un bug:
  // `offsetParent` también es `null` para cualquier elemento con `position: fixed`, y los
  // seis modales de este proyecto son fijos. En un navegador real habría descartado sus
  // botones legítimos y dejado la trampa de foco con un solo elemento, es decir sin ciclo.
  // Lo detectó la prueba `hace ciclo con Tab desde el último al primero`.
  //
  // Filtrar por atributo cubre el caso real —un elemento oculto a propósito— sin depender
  // del cálculo de diseño, que además no existe en el entorno de pruebas.
  .map((selector) => `${selector}:not([hidden]):not([aria-hidden="true"])`)
  .join(', ');

export interface UseModalDialogOptions {
  /** Si el modal está abierto. */
  isOpen: boolean;
  /** Se llama al pulsar Escape o al hacer clic en el fondo. */
  onClose: () => void;
  /**
   * Cerrar al pulsar Escape. Por defecto sí.
   *
   * Se puede desactivar en un modal con un formulario a medio rellenar, donde un Escape
   * accidental perdería el trabajo del usuario.
   */
  closeOnEscape?: boolean;
}

export interface UseModalDialogResult {
  /** Se pone en el contenedor del diálogo. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /**
   * Props del contenedor: los atributos que lo declaran diálogo ante el lector de
   * pantalla.
   */
  dialogProps: {
    role: 'dialog';
    'aria-modal': true;
    tabIndex: -1;
  };
  /**
   * Manejador del fondo oscurecido.
   *
   * Comprueba que el clic sea en el fondo y no en un hijo: sin eso, un clic que empieza
   * dentro del modal y termina en el borde lo cierra por accidente.
   */
  onBackdropClick: (event: React.MouseEvent<HTMLElement>) => void;
}

/**
 * Dota a un modal del comportamiento de teclado y de foco que espera un lector de
 * pantalla.
 *
 * @example
 * const { containerRef, dialogProps, onBackdropClick } = useModalDialog({ isOpen, onClose });
 *
 * <div onClick={onBackdropClick} className="fixed inset-0 ...">
 *   <div ref={containerRef} {...dialogProps} aria-labelledby="titulo">
 *     <h2 id="titulo">…</h2>
 *   </div>
 * </div>
 */
export function useModalDialog(options: UseModalDialogOptions): UseModalDialogResult {
  const { isOpen, closeOnEscape = true } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  // El elemento que tenía el foco antes de abrir, para devolvérselo al cerrar.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const onCloseRef = useRef(options.onClose);
  useEffect(() => {
    onCloseRef.current = options.onClose;
  });

  // ─── Foco al abrir y al cerrar ───
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (!container) return;

    // Se enfoca el primer elemento interactivo; si no hay ninguno, el contenedor. Sin
    // esto el foco se queda detrás del modal, tabulando por la página que tapa.
    const firstFocusable = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (firstFocusable ?? container).focus();

    return () => {
      // Devolver el foco es la mitad menos evidente y la que más se nota: sin ella el
      // usuario vuelve al principio del documento y tiene que recorrer la página otra vez
      // para llegar donde estaba.
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen]);

  // ─── Teclado: Escape y trampa de Tab ───
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));

      if (focusable.length === 0) {
        // Sin elementos enfocables, Tab no debe salirse del modal.
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // El ciclo se cierra a mano: el navegador llevaría el foco al documento de fondo,
      // que es exactamente lo que un modal no debe permitir.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // En fase de captura para adelantarse a los manejadores de los hijos: un `input` que
    // detenga la propagación de Escape dejaría el modal sin cerrar.
    document.addEventListener('keydown', handleKeyDown, true);

    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closeOnEscape]);

  // ─── Bloqueo del desplazamiento del fondo ───
  useEffect(() => {
    if (!isOpen) return;

    // Se guarda el valor anterior en lugar de asumir `''`: si dos modales se solapan, el
    // segundo en cerrarse restauraría el desplazamiento que el primero todavía bloquea.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const onBackdropClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    // Solo si el clic fue en el propio fondo. Sin esta comprobación, un clic que empieza
    // dentro del modal y suelta en el borde lo cierra por accidente.
    if (event.target === event.currentTarget) {
      onCloseRef.current();
    }
  }, []);

  return {
    containerRef,
    dialogProps: { role: 'dialog', 'aria-modal': true, tabIndex: -1 },
    onBackdropClick,
  };
}
