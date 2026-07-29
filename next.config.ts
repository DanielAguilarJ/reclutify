import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(self), microphone=(self), geolocation=()',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
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
  },
};

export default nextConfig;
