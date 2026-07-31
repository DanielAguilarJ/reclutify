import Image from 'next/image';

/**
 * Avatar de una persona o de una empresa.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO ES UN `next/image` A SECAS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Había veintiséis `<img>` nativos repartidos por el proyecto, quince de ellos avatares. La
 * corrección evidente es cambiarlos por `next/image` para obtener carga diferida, formato
 * moderno y dimensiones reservadas. Pero hacerlo a ciegas **rompe la aplicación en
 * ejecución**, y no de forma sutil:
 *
 * `next/image` valida el host del `src` contra `images.remotePatterns` de `next.config.ts` y
 * **lanza** si no coincide. Los avatares de este producto vienen de dos sitios:
 *
 *   1. `profiles.avatar_url` que sube el usuario → almacenamiento de Supabase, que SÍ está
 *      en `remotePatterns`.
 *   2. El inicio de sesión con Google (`signInWithOAuth({ provider: 'google' })` en
 *      `/login`), que rellena el avatar con una URL de `lh3.googleusercontent.com`.
 *
 * El segundo host no estaba declarado. Un `next/image` sobre él tira la página entera con
 * «hostname is not configured», y ocurriría solo para los usuarios que entraron con Google:
 * el tipo de fallo que no aparece en desarrollo y sí en producción.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * CÓMO LO RESUELVE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Se declara `lh3.googleusercontent.com` en `remotePatterns` Y, además, este componente
 * comprueba el host antes de elegir:
 *
 *   · Host conocido → `next/image`, con optimización.
 *   · Host desconocido → `<img loading="lazy" decoding="async">`.
 *
 * La comprobación no es desconfianza del `remotePatterns`: es que `avatar_url` es una columna
 * de texto que el usuario puede escribir, así que la lista de hosts posibles no está acotada
 * y nunca lo estará. El respaldo conserva lo que de verdad importa de la migración —la carga
 * diferida y la decodificación asíncrona— y renuncia solo a la optimización del servidor.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * LO QUE ARREGLA ADEMÁS DEL RENDIMIENTO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Los quince `<img>` de avatar tenían `alt` inconsistente: unos el nombre, otros la cadena
 * vacía, otros nada. Un avatar sin `alt` lo lee el lector de pantalla como la URL del
 * fichero, que en el almacenamiento de Supabase es un UUID.
 *
 * Aquí el `alt` se deriva del nombre, y cuando el avatar acompaña a un nombre que ya está
 * escrito al lado se marca decorativo con `decorative`: repetirlo haría que el lector dijera
 * el nombre dos veces por cada elemento de una lista.
 *
 * Y hay respaldo de iniciales, porque los tres sitios que lo tenían lo implementaban de tres
 * formas distintas.
 */

/**
 * Hosts para los que se puede usar el optimizador.
 *
 * Tiene que coincidir con `images.remotePatterns` de `next.config.ts`. Se duplica a
 * propósito en lugar de importarse: `next.config.ts` no es importable desde el código de la
 * aplicación, y una comprobación en tiempo de ejecución tiene que existir de todos modos
 * porque `avatar_url` no está acotado.
 */
const OPTIMIZABLE_HOST_SUFFIXES = [
  '.supabase.co',
  'lh3.googleusercontent.com',
  'avatars.githubusercontent.com',
] as const;

/** ¿El `src` apunta a un host que el optimizador acepta? */
function isOptimizable(src: string): boolean {
  // Una ruta relativa es del propio dominio, así que siempre es optimizable.
  if (src.startsWith('/')) return true;

  try {
    const { hostname, protocol } = new URL(src);

    // `data:` y `blob:` no tienen host. `next/image` no los admite, así que van al respaldo.
    if (protocol !== 'https:' && protocol !== 'http:') return false;

    return OPTIMIZABLE_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix.replace(/^\./, '') || hostname.endsWith(suffix),
    );
  } catch {
    // Un `avatar_url` corrupto no debe tirar el render.
    return false;
  }
}

/**
 * Iniciales de un nombre, para el respaldo cuando no hay imagen.
 *
 * Toma la primera letra de las dos primeras palabras. Se usa `Array.from` y no `[0]` para no
 * partir un carácter compuesto por la mitad: un nombre que empiece por un emoji o por una
 * letra con marca combinante produciría un carácter roto con indexación por unidad de código.
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (words.length === 0) return '?';

  return words
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join('');
}

export interface AvatarProps {
  /** URL de la imagen. `null` o vacío muestra las iniciales. */
  src?: string | null;
  /** Nombre de la persona o empresa. Se usa para el `alt` y para las iniciales. */
  name: string;
  /** Lado del cuadrado, en píxeles. */
  size?: number;
  /**
   * Marca el avatar como decorativo.
   *
   * Se pone cuando el nombre ya aparece escrito junto al avatar: sin esto el lector de
   * pantalla dice el nombre dos veces por cada elemento de una lista.
   */
  decorative?: boolean;
  /** Clases extra para el contenedor. */
  className?: string;
  /**
   * Carga la imagen con prioridad, sin diferirla.
   *
   * Solo para el avatar que forma parte del contenido principal visible al entrar —la
   * cabecera de un perfil—. Marcar varios como prioritarios anula el beneficio.
   */
  priority?: boolean;
}

/**
 * Muestra un avatar cuadrado con respaldo de iniciales.
 *
 * @example
 * // En una lista, junto al nombre escrito: decorativo.
 * <Avatar src={p.avatar_url} name={p.full_name} size={40} decorative />
 *
 * // Suelto, sin nombre al lado: describe a quién representa.
 * <Avatar src={p.avatar_url} name={p.full_name} size={96} priority />
 */
export function Avatar({
  src,
  name,
  size = 40,
  decorative = false,
  className = '',
  priority = false,
}: AvatarProps) {
  const containerClass = `shrink-0 overflow-hidden rounded-full bg-surface ${className}`.trim();

  // Sin imagen: iniciales. Es el caso de la mayoría de las cuentas nuevas, así que no es un
  // camino excepcional.
  if (!src) {
    return (
      <div
        // `role="img"` con `aria-label` hace que el lector anuncie a quién representa en vez
        // de leer las iniciales letra por letra.
        {...(decorative
          ? { 'aria-hidden': true as const }
          : { role: 'img' as const, 'aria-label': name })}
        className={`flex items-center justify-center font-semibold text-muted ${containerClass}`}
        style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.4)) }}
      >
        {initialsFor(name)}
      </div>
    );
  }

  // El `alt` vacío es lo que marca una imagen como decorativa en HTML. Omitir el atributo NO
  // es equivalente: sin él el lector lee la URL, que en el almacenamiento de Supabase es un
  // UUID.
  const alt = decorative ? '' : name;

  if (isOptimizable(src)) {
    return (
      <div className={containerClass} style={{ width: size, height: size }}>
        <Image
          src={src}
          alt={alt}
          width={size}
          height={size}
          priority={priority}
          // `sizes` evita que el optimizador genere variantes que nunca se usan: el avatar
          // mide siempre lo mismo.
          sizes={`${size}px`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className={containerClass} style={{ width: size, height: size }}>
      {/* Respaldo para hosts no declarados. Ver el comentario de cabecera: `avatar_url` no
          está acotado, así que este camino existe siempre. Conserva la carga diferida y la
          decodificación asíncrona, que es el grueso del beneficio. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        className="h-full w-full object-cover"
      />
    </div>
  );
}

export default Avatar;
