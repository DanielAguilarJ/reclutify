import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { classifySupabaseKeyShape } from '@/lib/supabase-key';

/**
 * Cliente exclusivo del servidor.
 *
 * IMPORTANTE:
 * - Nunca importar este archivo desde un componente con "use client".
 * - Nunca devolver SUPABASE_SERVICE_ROLE_KEY al navegador.
 * - Este cliente bypassa RLS y, por ello, cada endpoint que lo use
 *   debe validar explícitamente identidad, organización y permisos.
 *
 * La comprobación de presencia no basta: un valor presente pero con forma
 * equivocada (el nombre de la fila en vez de su valor, o la clave `anon`)
 * construía el cliente sin protestar y convertía el error de configuración en un
 * `401 Invalid API key` por operación, indistinguible de un bug de la app. Los
 * mensajes de abajo nunca interpolan el valor; la aparición literal de
 * `service_role` en el texto nombra la fila del panel, no el secreto.
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

  const keyShape = classifySupabaseKeyShape(serviceRoleKey);

  if (keyShape === 'anon') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY holds the project anon (publishable) key. That key cannot bypass RLS, so it is useless for admin operations. Open Supabase > Project Settings > API keys and copy the secret key value (the one on the service_role row) instead, then redeploy.',
    );
  }

  if (keyShape !== 'service-role') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not a Supabase service role key. Open Supabase > Project Settings > API keys and copy the VALUE of the service_role row (a secret starting with sb_secret_, or the legacy JWT) — not the row name, not a placeholder — then redeploy.',
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
