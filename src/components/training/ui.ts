/**
 * Clases compartidas de las pantallas del empleado.
 *
 * El rediseño necesita que el anillo de foco y el botón primario sean idénticos
 * en el índice, el bloque de continuación, el tutor y la vista de módulo. Cuando
 * cada componente escribe sus propias clases, el foco acaba siendo visible en
 * unos sitios y no en otros, que es exactamente el defecto de accesibilidad que
 * había. Todo el color sale de los tokens del tema (`accent`, `card`, `border`,
 * `muted`), nunca de un hex literal.
 */

/** Anillo de foco visible. Se aplica a TODO elemento enfocable de estas vistas. */
export const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** Una sola acción primaria por pantalla usa este relleno. */
export const primaryButton =
  `inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

/** Acciones secundarias: mismo peso visual que el borde de las tarjetas. */
export const secondaryButton =
  `inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-card-hover disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

/** Botón compacto de barra (volver, cerrar, alternar). */
export const iconButton =
  `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground ${focusRing}`;

/** Contenedor de bloque. Un solo nivel de elevación en toda la pantalla. */
export const cardSurface = 'rounded-2xl border border-border bg-card';

/** Ancho de línea de lectura cómoda (~68 caracteres). */
export const readingWidth = 'max-w-[68ch]';
