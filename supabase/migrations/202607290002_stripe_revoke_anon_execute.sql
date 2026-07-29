-- ============================================================
-- Stripe — Endurecimiento de permisos de update_org_subscription
--
-- PRECONDICIÓN DE DESPLIEGUE (leer antes de aplicar)
-- ------------------------------------------------------------
-- ATENCIÓN: ESTA MIGRACIÓN ROMPE EL WEBHOOK DE STRIPE si se
-- aplica contra un despliegue que todavía llama a la RPC con la
-- clave anon.
--
-- `src/app/api/stripe/webhooks/route.ts` construía su cliente
-- así:
--
--     process.env.SUPABASE_SERVICE_ROLE_KEY
--       ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
--
-- es decir, si faltaba `SUPABASE_SERVICE_ROLE_KEY` caía a la
-- clave pública y aun así funcionaba, porque la función estaba
-- concedida a `anon`. Ese fallback ya se eliminó: la ruta usa
-- `createAdminClient()`, que exige `SUPABASE_SERVICE_ROLE_KEY` y
-- lanza si falta.
--
-- Aplicar esta migración SOLO cuando el despliegue en producción
-- incluya ese cambio y `SUPABASE_SERVICE_ROLE_KEY` esté
-- configurada en el entorno de la aplicación.
--
-- CAUSA RAÍZ
-- ------------------------------------------------------------
-- `20260528_stripe_webhook_function.sql` concedía la función de
-- forma explícita:
--
--     GRANT EXECUTE ON FUNCTION public.update_org_subscription TO anon;
--     GRANT EXECUTE ON FUNCTION public.update_org_subscription TO authenticated;
--
-- y nunca revocaba `PUBLIC`. La función es `SECURITY DEFINER` y
-- actualiza `organizations` (plan, estado de suscripción, fin de
-- periodo) según parámetros que envía el llamante, sin ninguna
-- comprobación de identidad. Cualquiera con la clave pública del
-- proyecto podía regalarse un plan enterprise vía
-- `POST /rest/v1/rpc/update_org_subscription`.
--
-- Por eso aquí se revoca de `PUBLIC` **y** de `anon` y
-- `authenticated` por nombre, y se concede explícitamente a
-- `service_role`: sin el revoke de `PUBLIC` la función seguiría
-- siendo ejecutable por todos, ya que PostgreSQL concede
-- `EXECUTE` a `PUBLIC` por defecto al crear una función.
--
-- IDEMPOTENCIA: `REVOKE` de un privilegio ya inexistente y
-- `GRANT` de uno ya existente son no-ops en PostgreSQL. La
-- migración se puede reaplicar sin efecto. El bloque `DO` salta
-- la función si no existe todavía en el entorno
-- (`to_regprocedure(...) IS NULL`) en lugar de abortar.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CERRAR update_org_subscription A LA API PÚBLICA
-- ============================================================

DO $$
DECLARE
  -- Firma completa de 20260528_stripe_webhook_function.sql:
  -- (p_org_id, p_stripe_customer_id, p_stripe_subscription_id,
  --  p_plan_tier, p_billing_interval, p_subscription_status,
  --  p_subscription_period_end, p_lookup_by_customer,
  --  p_lookup_by_subscription)
  c_signature CONSTANT TEXT :=
    'public.update_org_subscription(uuid, text, text, text, text, text, timestamptz, text, text)';
BEGIN
  IF to_regprocedure(c_signature) IS NULL THEN
    RAISE NOTICE 'omitida (no existe en este entorno): %', c_signature;
    RETURN;
  END IF;

  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', c_signature);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', c_signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', c_signature);

  RAISE NOTICE 'EXECUTE ahora solo para service_role en %', c_signature;
END;
$$;

COMMIT;

-- ============================================================
-- 2. RECARGA DEL SCHEMA CACHE DE POSTGREST
-- Fuera de la transacción. Inocuo si se repite.
-- ============================================================

NOTIFY pgrst, 'reload schema';
