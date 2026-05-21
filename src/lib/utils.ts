/**
 * Shared utility functions for the application.
 */

/**
 * Sanitize text input — trim and limit length.
 */
export function sanitizeText(text: string, maxLength: number): string {
  return text.trim().slice(0, maxLength);
}

/**
 * Generate a URL-friendly username from a full name.
 * Deterministic slug with random numeric suffix for uniqueness.
 */
export function generateUsername(fullName: string): string {
  const base = fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return `${base}-${suffix}`;
}

/**
 * Classname merge utility - concatenates class strings, filtering falsy values.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Simple debounce utility.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}
