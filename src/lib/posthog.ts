import posthog from 'posthog-js';

/**
 * Initialize PostHog client-side analytics.
 * Only initializes when NEXT_PUBLIC_POSTHOG_KEY is set and not in development.
 */
export function initPostHog() {
  if (typeof window === 'undefined') return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

  if (!key) return;
  if (process.env.NODE_ENV === 'development') return;

  posthog.init(key, {
    api_host: host,
    person_profiles: 'identified_only',
    capture_pageview: false, // We handle this manually for App Router compatibility
    capture_pageleave: true,
    loaded: (ph) => {
      // Respect Do Not Track
      if (navigator.doNotTrack === '1') {
        ph.opt_out_capturing();
      }
    },
  });
}

export { posthog };
