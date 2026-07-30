import type { NextConfig } from 'next';

/**
 * Política de seguridad de contenido (CSP).
 *
 * POR QUÉ NO HABÍA NINGUNA
 * ------------------------
 * `next.config.ts` ya declaraba seis cabeceras de seguridad, pero faltaba la que
 * más importa: sin CSP, cualquier XSS que se cuele —por ejemplo a través de uno de
 * los campos que se interpolaban sin escapar— puede cargar y ejecutar script de
 * cualquier origen y exfiltrar a cualquier destino. La CSP es la red que limita el
 * daño de un fallo de sanitización que aún no conocemos.
 *
 * POR QUÉ `'unsafe-inline'` EN `script-src` (y por qué no se puede quitar hoy)
 * --------------------------------------------------------------------------
 * Next.js inyecta los datos de hidratación y el arranque del cliente en etiquetas
 * `<script>` en línea. Quitar `'unsafe-inline'` exige un nonce por petición, lo que
 * a su vez obliga a que TODA página se renderice de forma dinámica: el nonce cambia
 * en cada respuesta, así que ninguna puede servirse estática ni desde caché de CDN.
 *
 * Este proyecto tiene rutas públicas que dependen de esa caché (la landing, el
 * portal de empleo, las páginas de empresa y de perfil, todas con `metadata` para
 * SEO). Convertirlas en dinámicas para endurecer `script-src` cambiaría el perfil
 * de rendimiento del producto entero, y esa decisión no es de una ronda de
 * seguridad. Queda anotada en `REPORTE_REFACTOR.md`.
 *
 * `'unsafe-eval'` se incluye SOLO fuera de producción: React Refresh lo necesita en
 * desarrollo. En producción no se emite.
 *
 * DE DÓNDE SALE CADA ORIGEN
 * -------------------------
 * Ninguno es especulativo; todos están en uso en el código:
 *
 *  - `*.supabase.co`      — base de datos, autenticación, almacenamiento y
 *                            Realtime (`wss:` para las suscripciones).
 *  - `openrouter.ai`      — no aparece: las llamadas al modelo son de servidor a
 *                            servidor, nunca desde el navegador. Se deja fuera a
 *                            propósito.
 *  - `*.posthog.com`      — analítica (`src/lib/posthog.ts`), opcional.
 *  - `*.stripe.com` y `js.stripe.com` — `@stripe/stripe-js` carga su script y abre
 *                            el `frame` del portal de pago.
 *  - `images.unsplash.com`, `cdn.prod.website-files.com` — imágenes de la landing,
 *                            ya declaradas en `images.remotePatterns`.
 *  - `*.r2.cloudflarestorage.com` y el dominio público de R2 — vídeo de las
 *                            entrevistas (`connect-src` para el `PUT` prefirmado,
 *                            `media-src` para reproducirlo en el informe).
 *  - `data:` y `blob:`    — `URL.createObjectURL` de la grabación local y los PDF
 *                            que genera `@react-pdf/renderer` en el navegador.
 */
function buildContentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== 'production';

  // El dominio público de R2 es configurable, así que se añade si existe en vez de
  // incrustar un host concreto.
  const r2PublicOrigin = (() => {
    const raw = process.env.R2_PUBLIC_URL?.trim();
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  })();

  const posthogHost = (() => {
    const raw = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim();
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  })();

  const directives: Record<string, (string | null)[]> = {
    'default-src': ["'self'"],

    // Ver el comentario de cabecera sobre `'unsafe-inline'`.
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      isDev ? "'unsafe-eval'" : null,
      'https://js.stripe.com',
      'https://*.posthog.com',
      posthogHost,
    ],

    // Tailwind v4 y Framer Motion escriben estilos en línea (`style` calculado por
    // animación), así que `'unsafe-inline'` aquí es estructural, no un atajo.
    'style-src': ["'self'", "'unsafe-inline'"],

    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://*.supabase.co',
      'https://images.unsplash.com',
      'https://cdn.prod.website-files.com',
      r2PublicOrigin,
    ],

    'media-src': ["'self'", 'blob:', 'data:', 'https://*.supabase.co', r2PublicOrigin],

    'font-src': ["'self'", 'data:'],

    'connect-src': [
      "'self'",
      'https://*.supabase.co',
      // Realtime usa WebSocket; sin esto las suscripciones del feed y de la
      // mensajería fallan en silencio.
      'wss://*.supabase.co',
      'https://api.stripe.com',
      'https://*.posthog.com',
      posthogHost,
      'https://*.r2.cloudflarestorage.com',
      r2PublicOrigin,
      isDev ? 'ws://localhost:*' : null,
    ],

    // Stripe Checkout y el portal de facturación se abren en un iframe.
    'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com'],

    // Nadie debe poder incrustar la aplicación: la sala de entrevista pide cámara y
    // micrófono, y un iframe de terceros sería un vector de clickjacking sobre esos
    // permisos. Es el equivalente moderno de `X-Frame-Options: DENY`, que se
    // mantiene abajo por compatibilidad con navegadores antiguos.
    'frame-ancestors': ["'none'"],

    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],

    // Fuerza https en subrecursos. Fuera de producción estorba (localhost es http).
    ...(isDev ? {} : { 'upgrade-insecure-requests': [] }),
  };

  return Object.entries(directives)
    .map(([directive, values]) => {
      const resolved = values.filter((value): value is string => Boolean(value));
      return resolved.length > 0 ? `${directive} ${resolved.join(' ')}` : directive;
    })
    .join('; ');
}

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: buildContentSecurityPolicy(),
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    // Obsoleta y desactivada en los navegadores actuales, pero inocua y aún
    // relevante para versiones antiguas de Safari e IE. Se mantiene.
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    // `camera` y `microphone` con `self` porque la sala de entrevista los necesita.
    // `display-capture` se añade: el modo restringido comparte pantalla.
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(self)',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    // Aísla la ventana de las que la abrieron mediante `window.open`, para que un
    // origen ajeno no pueda leer referencias a nuestro contexto.
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin',
  },
];

const nextConfig: NextConfig = {
  // Ambos paquetes hacen IO de ficheros y usan `require` dinámico de Node, así
  // que no deben empaquetarse en el bundle del servidor: se dejan como externos
  // para que Node los cargue desde `node_modules` en runtime.
  //
  // - `pdf-parse`: su `index.js` ejecuta `Fs.readFileSync('./test/data/...')` al
  //   evaluarse cuando `module.parent` no está definido, y `lib/pdf.js` resuelve
  //   dependencias con `require` dinámico. Ver `src/lib/pdf-text.ts`.
  // - `mammoth`: lee y escribe ficheros desde su API y arrastra deps CJS.
  //
  // `serverExternalPackages` es estable a nivel raíz desde Next 15 (la variante
  // `experimental.serverComponentsExternalPackages` está deprecada).
  serverExternalPackages: ['pdf-parse', 'mammoth'],

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.prod.website-files.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    // Formatos modernos para las imágenes que sí pasan por el optimizador.
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
