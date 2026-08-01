import { useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { useDisclosure } from '@/hooks/useDisclosure';

/**
 * Pruebas del desplegable anclado.
 *
 * POR QUÉ NO SON LAS MISMAS QUE LAS DEL MODAL
 * -------------------------------------------
 * Un desplegable no es un diálogo, y tratarlo como tal es peor que no tratarlo. Estas
 * pruebas fijan justo las diferencias, para que nadie «unifique» los dos hooks más adelante
 * sin darse cuenta de que cambiaría el comportamiento:
 *
 *  - **No pone `aria-modal`.** Diría al lector de pantalla que el resto de la página está
 *    inerte, y en un panel anclado a la barra de navegación eso es falso.
 *  - **No atrapa el foco.** Tab debe poder salir y seguir por la página; atraparlo en un
 *    menú de tres enlaces es una jaula.
 *  - **No bloquea el desplazamiento.** Es desproporcionado para un desplegable.
 *
 * Y fija las cuatro propiedades que a los dos desplegables del proyecto les faltaban:
 * `aria-expanded`, `aria-controls`, cierre con Escape y cierre al pulsar fuera.
 */

/** Arnés con disparador, panel y un elemento externo para probar el clic fuera. */
function TestDisclosure({ onClose }: { onClose?: () => void }) {
  const { isOpen, close, triggerProps, panelProps } = useDisclosure({ onClose });

  return (
    <div>
      <button {...triggerProps} aria-label="Notificaciones">
        Campana
      </button>
      {isOpen && (
        <div {...panelProps}>
          <button type="button" onClick={close}>
            Dentro
          </button>
        </div>
      )}
      <button type="button" data-testid="fuera">
        Fuera
      </button>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = '';
});

describe('useDisclosure', () => {
  it('liga el disparador con el panel y refleja el estado', () => {
    render(<TestDisclosure />);

    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    // Sin `aria-expanded` el lector anuncia «botón» sin decir si pulsarlo abre o cierra.
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'true');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // `aria-controls` tiene que apuntar al panel que está en el DOM.
    const panelId = trigger.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toBeInTheDocument();
  });

  it('alterna con clics sucesivos', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Dentro' })).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByRole('button', { name: 'Dentro' })).not.toBeInTheDocument();
  });

  it('cierra con Escape y devuelve el foco al disparador', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Dentro' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    // Era lo que faltaba: el menú móvil solo se cerraba pulsando su fondo, que es una acción
    // de ratón.
    expect(screen.queryByRole('button', { name: 'Dentro' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('cierra al pulsar fuera', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByTestId('fuera'));

    expect(screen.queryByRole('button', { name: 'Dentro' })).not.toBeInTheDocument();
  });

  it('NO cierra al pulsar dentro del panel', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Dentro' }));

    // Un clic en el contenido no debe cerrar: el usuario está interactuando con él.
    expect(screen.getByRole('button', { name: 'Dentro' })).toBeInTheDocument();
  });

  it('NO se cierra y reabre en el mismo gesto al pulsar el disparador', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);

    // El `pointerdown` sobre el disparador no cuenta como «fuera»: si contara, cerraría el
    // panel y el `click` posterior lo volvería a abrir, dejándolo abierto tras un gesto que
    // pretendía cerrarlo.
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);

    expect(screen.queryByRole('button', { name: 'Dentro' })).not.toBeInTheDocument();
  });

  it('llama a onClose solo cuando estaba abierto', () => {
    const onClose = vi.fn();
    render(<TestDisclosure onClose={onClose} />);

    // Escape con el panel cerrado no debe notificar nada.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('NO declara aria-modal ni bloquea el desplazamiento', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);

    const panel = document.getElementById(trigger.getAttribute('aria-controls')!);

    // Las dos diferencias con el modal, fijadas para que unificar los hooks rompa una prueba
    // en vez de degradar la semántica en silencio.
    expect(panel).not.toHaveAttribute('aria-modal');
    expect(panel).not.toHaveAttribute('role', 'dialog');
    expect(document.body.style.overflow).toBe('');
  });

  it('no atrapa el foco: Tab puede salir', () => {
    render(<TestDisclosure />);
    const trigger = screen.getByRole('button', { name: 'Notificaciones' });

    fireEvent.click(trigger);

    const outside = screen.getByTestId('fuera');
    outside.focus();

    // El hook no instala ninguna trampa, así que el foco fuera del panel es válido y el
    // panel sigue abierto: cerrarlo aquí obligaría a reabrirlo para volver.
    expect(outside).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Dentro' })).toBeInTheDocument();
  });

  it('da identificadores distintos a dos instancias', () => {
    function TwoBells() {
      const first = useDisclosure();
      const second = useDisclosure();

      return (
        <>
          <button {...first.triggerProps} aria-label="Primera" />
          <button {...second.triggerProps} aria-label="Segunda" />
        </>
      );
    }

    render(<TwoBells />);

    // Con un `id` compartido, `aria-controls` sería ambiguo para el lector de pantalla.
    const a = screen.getByRole('button', { name: 'Primera' }).getAttribute('aria-controls');
    const b = screen.getByRole('button', { name: 'Segunda' }).getAttribute('aria-controls');

    expect(a).not.toBe(b);
  });

  it('open y close son idempotentes', () => {
    function Controlled() {
      const { isOpen, open, close } = useDisclosure();
      const [renders, setRenders] = useState(0);

      return (
        <>
          <span data-testid="estado">{isOpen ? 'abierto' : 'cerrado'}</span>
          <button type="button" onClick={() => { open(); open(); setRenders(renders + 1); }}>
            Abrir
          </button>
          <button type="button" onClick={() => { close(); close(); }}>
            Cerrar
          </button>
        </>
      );
    }

    render(<Controlled />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByTestId('estado')).toHaveTextContent('abierto');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByTestId('estado')).toHaveTextContent('cerrado');
  });
});
