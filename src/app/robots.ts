import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin/',
          '/api/',
          '/auth/',
          '/onboarding/',
          '/profile/edit',
          '/feed/',
          '/messages/',
          '/network/',
        ],
      },
    ],
    sitemap: 'https://www.reclutify.com/sitemap.xml',
  };
}
