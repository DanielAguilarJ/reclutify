import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Cliente exclusivo del servidor.
 *
 * IMPORTANTE:
 * - Nunca importar este archivo desde un componente con "use client".
 * - Nunca devolver SUPABASE_SERVICE_ROLE_KEY al navegador.
 * - Este cliente bypassa RLS y, por ello, cada endpoint que lo use
 *   debe validar explícitamente identidad, organización y permisos.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
  }

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
