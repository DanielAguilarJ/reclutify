/**
 * Shared utility for formatting relative timestamps.
 * Supports both Spanish and English locales.
 */

export function formatRelativeTime(dateStr: string, locale: 'en' | 'es' = 'es'): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return locale === 'es' ? 'ahora' : 'now';
  if (diffMin < 60) return locale === 'es' ? `hace ${diffMin}m` : `${diffMin}m ago`;

  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return locale === 'es' ? `hace ${diffHrs}h` : `${diffHrs}h ago`;

  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return locale === 'es' ? `hace ${diffDays}d` : `${diffDays}d ago`;

  const dateLocale = locale === 'es' ? 'es-MX' : 'en-US';
  return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' });
}

/**
 * Format a date as a full readable string.
 */
export function formatDate(dateStr: string, locale: 'en' | 'es' = 'es'): string {
  const date = new Date(dateStr);
  const dateLocale = locale === 'es' ? 'es-MX' : 'en-US';
  return date.toLocaleDateString(dateLocale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
