import { useEffect } from 'react';

/**
 * Avisa antes de abandonar la página con cambios sin guardar.
 *
 * QUÉ CUBRE Y QUÉ NO — IMPORTA SABERLO
 * ------------------------------------
 * Se apoya en el evento `beforeunload`, que el navegador dispara al **recargar, cerrar la pestaña
 * o navegar fuera del sitio**. Ahí el aviso aparece y es el navegador quien lo muestra: el texto lo
 * decide él, no se puede personalizar, y desde hace años ignora el mensaje que se le pase.
 *
 * NO cubre la navegación interna del App Router —pulsar un enlace del panel—, porque Next.js la
 * resuelve en el cliente sin descargar el documento, y en el App Router no hay un punto de
 * intercepción estable para eso. Cubrir ese caso exigiría envolver cada enlace o vigilar el
 * historial, y las dos cosas se rompen con cada cambio del enrutador.
 *
 * Aun así vale la pena: recargar por costumbre y cerrar la pestaña son dos de las formas más
 * habituales de perder un formulario largo, y hasta ahora no había ninguna red. La limitación queda
 * escrita aquí para que nadie dé por hecho que el aviso protege más de lo que protege.
 *
 * @param hasUnsavedChanges Si hay algo que perder. Con `false` no se registra nada.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    // Sin cambios pendientes no se registra el oyente, en lugar de registrarlo y salir dentro.
    // Algunos navegadores tratan la simple presencia de un `beforeunload` como motivo para
    // descartar la caché de retroceso-avance, y eso ralentiza la navegación de todo el mundo por
    // un aviso que no toca mostrar.
    if (!hasUnsavedChanges) return;

    const handler = (event: BeforeUnloadEvent) => {
      // `preventDefault` es lo que la especificación pide hoy; la asignación a `returnValue` es lo
      // que siguen exigiendo algunos navegadores. Hacen falta las dos para que el aviso salga en
      // todas partes.
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);

    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [hasUnsavedChanges]);
}
