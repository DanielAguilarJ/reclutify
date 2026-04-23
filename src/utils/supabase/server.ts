import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Crea un cliente de Supabase para Server Components y Server Actions.
 * Usa SOLO NEXT_PUBLIC_SUPABASE_ANON_KEY — el nombre estándar de Supabase.
 *
 * Nota: Durante el build de Next.js (prerendering), las env vars podrían no existir.
 * En ese caso usamos placeholders para que el build no falle.
 * En runtime (Vercel), las env vars siempre estarán disponibles.
 */
export const createClient = async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
