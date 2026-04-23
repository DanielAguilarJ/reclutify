import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Crea un cliente de Supabase para el middleware y refresca la sesión del usuario.
 * Usa supabase.auth.getUser() (seguro) en vez de getSession() (inseguro en server).
 * Retorna el response con cookies actualizadas + datos del usuario.
 */
export const createClient = async (request: NextRequest) => {
  // Crear una respuesta sin modificar
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl || "https://placeholder.supabase.co",
    supabaseKey || "placeholder-key",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Actualizar cookies en el request (para que Server Components lean cookies frescas)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Recrear el response para que incluya las cookies actualizadas
          supabaseResponse = NextResponse.next({
            request,
          });
          // Setear las cookies en el response (para que el browser las guarde)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: Usar getUser() en vez de getSession() para validación segura.
  // getUser() contacta al servidor de auth de Supabase y valida el JWT.
  // getSession() solo lee el JWT local y puede ser manipulado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabaseResponse, user };
};
