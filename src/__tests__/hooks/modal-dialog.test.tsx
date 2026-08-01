import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useModalDialog } from '@/hooks/useModalDialog';

/**
 * Pruebas del comportamiento accesible de los modales.
 *
 * QUÉ FIJAN
 * ---------
 * Los seis modales del proyecto se pintaban como un `div` sobre un fondo oscurecido, sin
 * `role="dialog"`, sin trampa de foco y sin cierre con Escape. Estas pruebas fijan las
 * cuatro propiedades que faltaban, y cada una corresponde a un fallo concreto de uso con
 * teclado:
 *
 *  1. El foco entra al modal al abrir (si no, se tabula por la página que el modal tapa).
 *  2. Tab hace ciclo dentro (si no, el foco se escapa al documento de fondo).
 *  3. Escape cierra (si no, no hay forma de cerrar sin ratón).
 *  4. El foco vuelve al disparador al cerrar (si no, hay que recorrer la página otra vez).
 */

/** Modal de prueba con tres elementos enfocables. */
function TestDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { containerRef, dialogProps, onBackdropClick } = useModalDialog({ isOpen, onClose });

  if (!isOpen) return null;

  return (
    <div data-testid="backdrop" onClick={onBackdropClick}>
      <div ref={containerRef} {...dialogProps} aria-labelledby="titulo">
        <h2 id="titulo">Título del diálogo</h2>
        <button type="button">Primero</button>
        <input aria-label="Campo" />
        <button type="button">Último</button>
      </div>
    </div>
  );
}

/** Arnés con disparador y modal, para comprobar la devolución del foco. */
function Harness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Abrir
      </button>
      <TestDialog isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('useModalDialog', () => {
  it('declara el contenedor como diálogo modal', () => {
    render(<TestDialog isOpen onClose={() => {}} />);

    const dialog = screen.getByRole('dialog');

    // Sin `role="dialog"` el contenido aparece como texto suelto en medio del documento y
    // el lector de pantalla no indica que algo se abrió.
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Título del diálogo');
  });

  it('mueve el foco al primer elemento interactivo al abrir', () => {
    render(<TestDialog isOpen onClose={() => {}} />);

    // Sin esto el foco se queda detrás del modal, tabulando por los enlaces de la página
    // que está tapando.
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus();
  });

  it('cierra con Escape', () => {
    const onClose = vi.fn();
    render(<TestDialog isOpen onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('respeta closeOnEscape en false', () => {
    const onClose = vi.fn();

    function NoEscapeDialog() {
      const { containerRef, dialogProps } = useModalDialog({
        isOpen: true,
        onClose,
        closeOnEscape: false,
      });
      return (
        <div ref={containerRef} {...dialogProps} aria-label="Sin escape">
          <button type="button">Único</button>
        </div>
      );
    }

    render(<NoEscapeDialog />);
    fireEvent.keyDown(document, { key: 'Escape' });

    // Es la opción para un formulario a medio rellenar, donde un Escape accidental
    // perdería el trabajo del usuario.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hace ciclo con Tab desde el último al primero', () => {
    render(<TestDialog isOpen onClose={() => {}} />);

    const last = screen.getByRole('button', { name: 'Último' });
    last.focus();

    fireEvent.keyDown(document, { key: 'Tab' });

    // El navegador llevaría el foco al documento de fondo, que es exactamente lo que un
    // modal no debe permitir.
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus();
  });

  it('hace ciclo con Shift+Tab desde el primero al último', () => {
    render(<TestDialog isOpen onClose={() => {}} />);

    screen.getByRole('button', { name: 'Primero' }).focus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(screen.getByRole('button', { name: 'Último' })).toHaveFocus();
  });

  it('devuelve el foco al disparador al cerrar', () => {
    render(<Harness />);

    const trigger = screen.getByRole('button', { name: 'Abrir' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    // Sin esta parte el usuario vuelve al principio del documento y tiene que recorrer la
    // página otra vez para llegar donde estaba.
    expect(trigger).toHaveFocus();
  });

  it('cierra al hacer clic en el fondo pero no dentro del diálogo', () => {
    const onClose = vi.fn();
    render(<TestDialog isOpen onClose={onClose} />);

    // Un clic dentro no debe cerrar: sin la comprobación de `target === currentTarget`, un
    // clic que empieza dentro y suelta en el borde lo cerraba por accidente.
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('bloquea el desplazamiento del fondo y lo restaura al cerrar', () => {
    const { unmount } = render(<TestDialog isOpen onClose={() => {}} />);

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    // Se restaura el valor ANTERIOR y no `''`: si dos modales se solapan, el segundo en
    // cerrarse no debe desbloquear el desplazamiento que el primero todavía retiene.
    expect(document.body.style.overflow).toBe('');
  });

  it('no instala nada cuando está cerrado', () => {
    const onClose = vi.fn();
    render(<TestDialog isOpen={false} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
  });
});
