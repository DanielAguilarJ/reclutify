import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reclutify — AI Interview Platform',
    short_name: 'Reclutify',
    description:
      'Plataforma de entrevistas con inteligencia artificial para reclutamiento. Conduce entrevistas con IA, evalúa candidatos y toma decisiones basadas en datos.',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a1b23',
    theme_color: '#3b4cca',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
