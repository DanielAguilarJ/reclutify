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
          '/login',
          '/training/center/',
          '/my-jobs/',
          '/write/',
          '/groups/',
          '/sign-in/',
          '/sign-up/',
        ],
      },
      {
        userAgent: 'GPTBot',
        disallow: ['/'],
      },
    ],
    sitemap: 'https://www.reclutify.com/sitemap.xml',
  };
}
