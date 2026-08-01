'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

/**
 * Comportamiento accesible de un desplegable anclado a un botón.
 *
 * POR QUÉ NO SE REUTILIZA `useModalDialog`
 * ----------------------------------------
 * Un desplegable NO es un diálogo modal, y tratarlo como tal es peor que no tratarlo:
 *
 *  - `aria-modal="true"` le dice al lector de pantalla que el resto de la página está
 *    inerte. En un panel de notificaciones anclado a la barra de navegación eso es falso:
 *    la página sigue ahí y el usuario puede querer irse a otro sitio.
 *  - La trampa de foco impide salir con Tab. En un modal eso es correcto; en un desplegable
 *    es una jaula: lo normal es que Tab lo cierre y siga por la página.
 *  - Bloquear el desplazamiento del fondo por abrir un menú de tres enlaces es
 *    desproporcionado.
 *
 * El patrón correcto para esto es `aria-expanded` en el disparador más `aria-controls`
 * apuntando al panel, cierre con Escape, y cierre al pulsar fuera. Es lo que hace este hook.
 *
 * QUÉ LES FALTABA A LOS DOS DESPLEGABLES DEL PROYECTO
 * --------------------------------------------------
 * El menú móvil de la landing y el panel de notificaciones no tenían NINGUNO de los cuatro.
 * En concreto:
 *
 *  - Sin `aria-expanded`, el lector de pantalla anuncia el botón sin decir si lo que
 *    controla está abierto o cerrado, así que no hay forma de saber si pulsarlo abre o
 *    cierra.
 *  - Sin cierre con Escape, quien navega con teclado no puede cerrarlos: el menú móvil solo
 *    se cerraba pulsando su fondo, que es una acción de ratón.
 *  - Al cerrarse, el foco no volvía al disparador.
 */

export interface UseDisclosureOptions {
  /** Se llama al cerrar por Escape o por clic fuera. Opcional. */
  onClose?: () => void;
  /**
   * Devolver el foco al disparador al cerrar. Por defecto sí.
   *
   * Se desactiva cuando el cierre viene de haber navegado a otro sitio: devolver el foco a
   * un botón de una página que ya se abandonó no tiene sentido.
   */
  restoreFocus?: boolean;
}

export interface UseDisclosureResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Se pone en el botón que abre el desplegable. */
  triggerProps: {
    ref: React.RefObject<HTMLButtonElement | null>;
    'aria-expanded': boolean;
    'aria-controls': string;
    'aria-haspopup': true;
    type: 'button';
    onClick: () => void;
  };
  /** Se pone en el contenedor del panel. */
  panelProps: {
    ref: React.RefObject<HTMLDivElement | null>;
    id: string;
  };
}

/**
 * Gestiona un desplegable anclado.
 *
 * @example
 * const disclosure = useDisclosure();
 *
 * <button {...disclosure.triggerProps} aria-label="Notificaciones">
 *   <Bell />
 * </button>
 * {disclosure.isOpen && <div {...disclosure.panelProps}>…</div>}
 */
export function useDisclosure(options: UseDisclosureOptions = {}): UseDisclosureResult {
  const { restoreFocus = true } = options;

  const [isOpen, setIsOpen] = useState(false);

  // Un identificador estable por instancia liga el disparador con el panel mediante
  // `aria-controls`. Sin él, dos desplegables en la misma página compartirían el mismo `id`
  // y la relación quedaría ambigua para el lector de pantalla.
  const panelId = useId();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const onCloseRef = useRef(options.onClose);
  useEffect(() => {
    onCloseRef.current = options.onClose;
  });

  const close = useCallback(() => {
    setIsOpen((wasOpen) => {
      if (wasOpen) onCloseRef.current?.();
      return false;
    });
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);

  // ─── Escape ───
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      // No se llama a `preventDefault`: Escape puede tener otros significados en la página
      // (cancelar una entrada de texto, por ejemplo) y este desplegable no debe apropiárselo.
      close();

      if (restoreFocus) triggerRef.current?.focus();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close, restoreFocus]);

  // ─── Clic fuera ───
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      // Un clic en el DISPARADOR no cuenta como «fuera»: su propio `onClick` ya alterna el
      // estado, y cerrarlo aquí además lo dejaría cerrándose y abriéndose en el mismo gesto.
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;

      close();
    };

    // `pointerdown` y no `click`: con `click` un gesto que empieza dentro del panel y suelta
    // fuera lo cerraría, y al revés. `pointerdown` refleja dónde empezó el gesto, que es lo
    // que el usuario quiso.
    document.addEventListener('pointerdown', handlePointerDown);

    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, close]);

  return {
    isOpen,
    open,
    close,
    toggle,
    triggerProps: {
      ref: triggerRef,
      'aria-expanded': isOpen,
      'aria-controls': panelId,
      'aria-haspopup': true,
      type: 'button',
      onClick: toggle,
    },
    panelProps: { ref: panelRef, id: panelId },
  };
}
