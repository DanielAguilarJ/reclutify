'use server';

import { requireApiUser } from '@/lib/api/auth';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import type { PlanTier } from '@/lib/stripe';

/**
 * Lectura del estado de facturación de la organización propia.
 *
 * POR QUÉ EXISTE
 * --------------
 * `/admin/settings` leía el estado de suscripción DESDE EL NAVEGADOR con la clave
 * anon:
 *
 *     supabase.from('organizations')
 *       .select('plan_tier, subscription_status, subscription_period_end, billing_interval, stripe_customer_id, stripe_subscription_id')
 *
 * Y la política de lectura de esa tabla era `TO anon, authenticated USING (true)`
 * (`20260510_company_pages.sql`), pensada para publicar la ficha pública de
 * empresa. El efecto combinado es que **cualquiera con la clave anon —que va en
 * el bundle de cada página— podía descargar el estado de suscripción de TODAS las
 * organizaciones**: quién está en `past_due`, quién en prueba, cuándo vence cada
 * contrato, y los identificadores de cliente y suscripción de Stripe.
 *
 * La migración `202608020002` revoca el `SELECT` de esas cinco columnas para
 * `anon` y `authenticated`. Este módulo es el camino que las sustituye: lee con la
 * clave de servicio DESPUÉS de comprobar la sesión, y devuelve únicamente la
 * organización del propio usuario.
 *
 * QUÉ NO SALE DE AQUÍ
 * -------------------
 * `stripe_customer_id` y `stripe_subscription_id` NO se devuelven. La interfaz no
 * los usaba: solo pintaba plan, estado y fecha de renovación. Quien los necesita
 * son `/api/stripe/checkout` y `/api/stripe/portal`, que los leen por su cuenta en
 * el servidor y nunca los envían al navegador.
 */

/** Estado de facturación que la interfaz necesita. */
export interface OrgBillingSummary {
  planTier: PlanTier;
  subscriptionStatus: string;
  subscriptionPeriodEnd: string | null;
  billingInterval: string | null;
  /** Si hay suscripción en Stripe, para decidir si mostrar el portal. */
  hasBillingAccount: boolean;
}

const DEFAULT_SUMMARY: OrgBillingSummary = {
  planTier: 'starter',
  subscriptionStatus: 'trialing',
  subscriptionPeriodEnd: null,
  billingInterval: null,
  hasBillingAccount: false,
};

/** Planes válidos, para no castear una cadena arbitraria de la base a `PlanTier`. */
const PLAN_TIERS: readonly PlanTier[] = ['starter', 'pro', 'enterprise'];

function toPlanTier(value: unknown): PlanTier {
  return typeof value === 'string' && (PLAN_TIERS as readonly string[]).includes(value)
    ? (value as PlanTier)
    : 'starter';
}

/**
 * Resuelve la organización activa del usuario autenticado.
 *
 * Se lee con el cliente de SESIÓN a propósito: `user_profiles` sí es legible por
 * el propio usuario vía RLS, y así la resolución de «cuál es mi organización»
 * sigue sujeta a las políticas en vez de saltárselas.
 */
async function resolveOwnOrgId(userId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('user_profiles')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle();

  return data?.org_id ?? null;
}

/**
 * Devuelve el estado de facturación de la organización del usuario autenticado.
 *
 * Nunca lanza: la tarjeta de facturación es informativa y un fallo de lectura no
 * debe tumbar la página de ajustes completa. Sin sesión o sin organización
 * devuelve el plan por defecto, que es lo que la interfaz ya mostraba.
 */
export async function getOrgBillingSummary(): Promise<OrgBillingSummary> {
  try {
    const user = await requireApiUser();
    const orgId = await resolveOwnOrgId(user.id);

    if (!orgId) return DEFAULT_SUMMARY;

    // Cliente de servicio: las columnas de facturación ya no son legibles con la
    // clave anon. La autorización la da el `orgId`, que se resolvió arriba desde
    // el perfil del propio usuario y nunca desde la petición.
    const admin = createAdminClient();

    const { data, error } = await admin
      .from('organizations')
      .select('plan_tier, subscription_status, subscription_period_end, billing_interval, stripe_subscription_id')
      .eq('id', orgId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error('[billing] organization lookup failed:', error.message);
      return DEFAULT_SUMMARY;
    }

    return {
      planTier: toPlanTier(data.plan_tier),
      subscriptionStatus: data.subscription_status ?? 'trialing',
      subscriptionPeriodEnd: data.subscription_period_end ?? null,
      billingInterval: data.billing_interval ?? null,
      // Se devuelve un booleano y no el identificador: la interfaz solo necesita
      // saber si hay cuenta de facturación para decidir si ofrece el portal.
      hasBillingAccount: Boolean(data.stripe_subscription_id),
    };
  } catch (error) {
    console.error('[billing] summary failed:', error);
    return DEFAULT_SUMMARY;
  }
}
