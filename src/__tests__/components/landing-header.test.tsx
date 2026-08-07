import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

/**
 * Regresión del header de la landing.
 *
 * QUÉ PROTEGE ESTE ARCHIVO
 * ------------------------
 * El header tenía dos controles inservibles al ratón: «Iniciar sesión» y el botón del menú
 * móvil. La causa no era el `href` ni el handler —con Enter ambos funcionaban— sino una capa
 * decorativa `absolute inset-0` sin `pointer-events-none`: al estar posicionada se pintaba
 * por encima de todo control que no lo estuviera también, y se tragaba el clic. `opacity-0`
 * no desactiva los eventos de puntero, así que bloqueaba en los dos estados de scroll.
 *
 * jsdom no calcula apilado ni acepta hit-testing, de modo que aquí NO se comprueba
 * geometría: se fijan los invariantes de marcado que hacen imposible reintroducir el fallo.
 * La comprobación de que el clic llega de verdad se hace con Playwright sobre render real.
 */

const { mockUseAppStore } = vi.hoisted(() => ({ mockUseAppStore: vi.fn() }));

vi.mock('@/store/appStore', () => ({ useAppStore: mockUseAppStore }));

// LanguageToggle lee el store con su propia forma; para este archivo es ruido.
vi.mock('@/components/ui/LanguageToggle', () => ({
  default: () => <button type="button">idioma</button>,
}));

import { Header } from '@/components/landing/Header';

/**
 * Capas decorativas del header: posicionadas en absoluto y fuera del árbol de
 * accesibilidad. Se busca en TODO el `<header>`, no solo dentro de `<nav>`, porque el
 * cristal vive en el contenedor que envuelve al nav — y porque el invariante que
 * importa («ninguna decoración roba clics») no depende de dónde se cuelgue la capa.
 *
 * Se evalúa con el menú CERRADO a propósito. El fondo del panel móvil también es una
 * capa `absolute`, pero es interactiva por diseño: es la superficie de clic-para-cerrar.
 * Con el panel cerrado no existe, así que lo que queda son exactamente las decorativas.
 */
const capasDecorativas = () =>
  Array.from(document.querySelectorAll<HTMLElement>('header *')).filter((el) => {
    const c = el.getAttribute('class') ?? '';
    return /(?:^|\s)absolute(?:\s|$)/.test(c) || c.includes(' absolute');
  });

describe('Header de la landing', () => {
  beforeEach(() => {
    mockUseAppStore.mockReturnValue({ language: 'es' });
  });

  describe('las capas decorativas no pueden robar clics', () => {
    it('toda capa absoluta dentro del nav lleva pointer-events-none', () => {
      render(<Header />);

      const decorativas = capasDecorativas();

      // Si el rediseño quita las capas, este test deja de aportar: exigimos que haya alguna.
      expect(decorativas.length, 'no se encontró ninguna capa de cristal').toBeGreaterThan(0);

      for (const capa of decorativas) {
        expect(capa.className, `capa decorativa sin pointer-events-none: ${capa.className}`)
          .toContain('pointer-events-none');
      }
    });

    it('las capas decorativas están fuera del árbol de accesibilidad', () => {
      render(<Header />);

      const decorativas = capasDecorativas();

      for (const capa of decorativas) {
        expect(capa.getAttribute('aria-hidden'), `capa sin aria-hidden: ${capa.className}`).toBe('true');
      }
    });

    it('ninguna capa decorativa contiene un elemento interactivo', () => {
      render(<Header />);

      const decorativas = capasDecorativas();

      for (const capa of decorativas) {
        expect(capa.querySelectorAll('a, button, input, [tabindex]')).toHaveLength(0);
      }
    });
  });

  describe('vías de acceso a la cuenta', () => {
    it('el header expone «Iniciar sesión» apuntando a /login', () => {
      render(<Header />);
      const login = screen.getAllByRole('link', { name: /iniciar sesión/i });
      expect(login.length).toBeGreaterThan(0);
      expect(login[0]).toHaveAttribute('href', '/login');
    });

    it('el panel móvil también ofrece «Iniciar sesión»', () => {
      render(<Header />);

      fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }));

      const panelId = screen
        .getByRole('button', { name: /cerrar menú/i })
        .getAttribute('aria-controls');
      const panel = document.getElementById(panelId!);

      expect(panel, 'el botón debe apuntar a un panel existente vía aria-controls').not.toBeNull();
      expect(panel!.querySelector('a[href="/login"]')).not.toBeNull();
    });

    it('el panel móvil conserva los cinco enlaces de navegación', () => {
      render(<Header />);

      fireEvent.click(screen.getByRole('button', { name: /abrir menú/i }));

      const panelId = screen
        .getByRole('button', { name: /cerrar menú/i })
        .getAttribute('aria-controls');
      const panel = document.getElementById(panelId!)!;

      for (const href of ['#product', '#how-it-works', '/pricing', '#roles', '/practice']) {
        expect(panel.querySelector(`a[href="${href}"]`), `falta ${href}`).not.toBeNull();
      }
    });
  });

  describe('contrato responsive', () => {
    /**
     * En el Stage 2 este bloque prohibía `md:` en el header. Era un proxy: lo que se
     * quería impedir es el DESBORDE a 768px, y en aquel diseño —una única píldora de
     * 916px— prohibir `md:` lo conseguía. La dirección «riel» cambia el hecho de fondo:
     * el riel ocupa todo el ancho, mide 645px a 768px y por tanto SÍ cabe, así que `md:`
     * pasó de ser el síntoma a ser la herramienta. El proxy quedó incorrecto.
     *
     * El invariante de desborde no es comprobable en jsdom, que no calcula layout: vive
     * en el hit-test de Playwright que acompaña al PR. Lo que sí se puede fijar aquí es
     * el CONTRATO por franjas, que es la decisión de diseño que no debe erosionarse.
     */
    const cls = (el: Element | null | undefined) => el?.getAttribute('class') ?? '';

    it('los cinco enlaces aparecen desde 768px (md), no desde 1024px', () => {
      const { container } = render(<Header />);

      const grupo = Array.from(container.querySelectorAll('header nav > div')).find((d) =>
        d.querySelector('a[href="#product"]'),
      );

      expect(grupo, 'no se encontró el grupo de enlaces del riel').toBeDefined();
      expect(cls(grupo)).toContain('hidden');
      expect(cls(grupo), 'los enlaces deben entrar en md, que es lo que recupera la navegación en tablet')
        .toContain('md:flex');
    });

    it('idioma y sesión se reservan para 1024px, que es lo que libera el ancho en tablet', () => {
      const { container } = render(<Header />);

      const login = container.querySelector('header nav a[href="/login"]');
      expect(cls(login)).toContain('hidden');
      expect(cls(login)).toContain('lg:inline-flex');

      const lang = Array.from(container.querySelectorAll('header nav div')).find(
        (d) => cls(d).includes('lg:block') && cls(d).includes('hidden'),
      );
      expect(lang, 'el selector de idioma debe ir en un contenedor hidden lg:block').toBeDefined();
    });

    it('la hamburguesa cubre todo lo que hay por debajo de 1024px', () => {
      render(<Header />);
      const burger = screen.getByRole('button', { name: /abrir menú/i });
      expect(cls(burger)).toContain('lg:hidden');
    });

    it('el CTA principal está visible en todos los anchos y no se duplica', () => {
      const { container } = render(<Header />);

      const ctas = container.querySelectorAll('a[href="/login?mode=register"]');
      // Una sola vía a registro. El panel móvil llegó a repetirlo a 30px del original,
      // lo que no añade un camino nuevo: compite consigo mismo.
      expect(ctas).toHaveLength(1);
      expect(cls(ctas[0])).not.toContain('hidden');
    });
  });

  describe('wordmark', () => {
    it('fija el color explícitamente en vez de depender del esquema del sistema', () => {
      const { container } = render(<Header />);

      const wordmark = Array.from(container.querySelectorAll('span')).find(
        (s) => s.textContent === 'reclutify',
      );

      expect(wordmark).toBeDefined();
      // `text-black dark:text-white` deja el wordmark negro sobre #0a0a0a (1.14:1 medido)
      // cuando el SO está en claro, porque el proyecto no declara `@custom-variant dark`.
      expect(wordmark!.className).not.toContain('dark:text-white');
      expect(wordmark!.className).toContain('text-[#fafafa]');
    });
  });
});
