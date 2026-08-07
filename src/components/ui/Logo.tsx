export default function Logo({ 
  size = 'default', 
  forceWhiteLabel = false,
  companyName,
  tone = 'auto'
}: { 
  size?: 'default' | 'small' | 'large', 
  forceWhiteLabel?: boolean,
  companyName?: string,
  /**
   * Color del wordmark.
   *
   * `auto` mantiene `text-black dark:text-white`, que es lo que había. Ojo: el
   * proyecto NO declara `@custom-variant dark`, así que esa variante la resuelve
   * Tailwind v4 por `prefers-color-scheme` — NO por el `[data-theme="dark"]` que
   * usa el tema de la app. En una superficie con fondo oscuro forzado (la landing
   * fija `bg-[#0a0a0a]`) el wordmark sale negro sobre negro para quien tenga el
   * SO en claro: medido 1.06:1, por debajo de cualquier umbral de WCAG.
   *
   * `light` / `dark` fijan el color explícitamente y son la opción correcta en
   * esas superficies. Las otras pantallas que fuerzan fondo oscuro (`/pricing`,
   * `/career-fair`, `not-found`) siguen con el mismo problema y necesitan el
   * mismo trato o un `@custom-variant dark` global.
   */
  tone?: 'auto' | 'light' | 'dark'
}) {
  const toneClass =
    tone === 'light' ? 'text-[#fafafa]'
    : tone === 'dark' ? 'text-black'
    : 'text-black dark:text-white';

  return (
    <div className="flex items-center gap-2">
      <span
        className={`font-black tracking-tight ${toneClass} ${
          size === 'small' ? 'text-xl' : size === 'large' ? 'text-4xl' : 'text-2xl'
        }`}
      >
        {companyName || (forceWhiteLabel ? 'reclutify' : 'reclutify')}
      </span>
    </div>
  );
}
