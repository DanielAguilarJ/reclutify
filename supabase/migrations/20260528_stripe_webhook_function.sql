-- Create a SECURITY DEFINER function that bypasses RLS
-- for updating subscription data from Stripe webhooks.
-- This function is the single entry point for subscription state changes.

CREATE OR REPLACE FUNCTION public.update_org_subscription(
  p_org_id               UUID DEFAULT NULL,
  p_stripe_customer_id   TEXT DEFAULT NULL,
  p_stripe_subscription_id TEXT DEFAULT NULL,
  p_plan_tier            TEXT DEFAULT NULL,
  p_billing_interval     TEXT DEFAULT NULL,
  p_subscription_status  TEXT DEFAULT NULL,
  p_subscription_period_end TIMESTAMPTZ DEFAULT NULL,
  p_lookup_by_customer   TEXT DEFAULT NULL,
  p_lookup_by_subscription TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_id UUID;
BEGIN
  -- Determine the org to update
  IF p_org_id IS NOT NULL THEN
    target_id := p_org_id;
  ELSIF p_lookup_by_customer IS NOT NULL THEN
    SELECT id INTO target_id FROM organizations WHERE stripe_customer_id = p_lookup_by_customer LIMIT 1;
  ELSIF p_lookup_by_subscription IS NOT NULL THEN
    SELECT id INTO target_id FROM organizations WHERE stripe_subscription_id = p_lookup_by_subscription LIMIT 1;
  END IF;

  IF target_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE organizations SET
    stripe_customer_id      = COALESCE(p_stripe_customer_id, stripe_customer_id),
    stripe_subscription_id  = CASE WHEN p_stripe_subscription_id = '__CLEAR__' THEN NULL ELSE COALESCE(p_stripe_subscription_id, stripe_subscription_id) END,
    plan_tier               = COALESCE(p_plan_tier, plan_tier),
    billing_interval        = COALESCE(p_billing_interval, billing_interval),
    subscription_status     = COALESCE(p_subscription_status, subscription_status),
    subscription_period_end = CASE WHEN p_subscription_period_end = '1970-01-01T00:00:00Z'::timestamptz THEN NULL ELSE COALESCE(p_subscription_period_end, subscription_period_end) END
  WHERE id = target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_org_subscription TO anon;
GRANT EXECUTE ON FUNCTION public.update_org_subscription TO authenticated;
