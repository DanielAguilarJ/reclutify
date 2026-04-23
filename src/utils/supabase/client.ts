import { createBrowserClient } from "@supabase/ssr";

/**
 * Crea un cliente de Supabase para el lado del cliente (browser).
 * Usa SOLO NEXT_PUBLIC_SUPABASE_ANON_KEY — el nombre estándar de Supabase.
 *
 * Nota: Durante el build de Next.js (prerendering), las env vars NEXT_PUBLIC_*
 * podrían no estar disponibles. Usamos placeholders para que el build no falle.
 * En runtime (browser/Vercel), las env vars siempre estarán inline en el bundle.
 */
export const createClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  return createBrowserClient(supabaseUrl, supabaseKey);
};
