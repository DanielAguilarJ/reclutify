-- Add Stripe subscription columns to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plan_tier               TEXT NOT NULL DEFAULT 'starter'
                                                     CHECK (plan_tier IN ('starter','pro','enterprise')),
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT NOT NULL DEFAULT 'trialing'
                                                     CHECK (subscription_status IN ('active','trialing','past_due','canceled','incomplete','incomplete_expired','unpaid')),
  ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_interval        TEXT DEFAULT 'monthly'
                                                     CHECK (billing_interval IN ('monthly','yearly'));

-- Index for fast webhook lookups
CREATE INDEX IF NOT EXISTS idx_orgs_stripe_customer    ON organizations (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_orgs_stripe_subscription ON organizations (stripe_subscription_id);

-- Migrate existing plan column data into new plan_tier column
UPDATE organizations
SET plan_tier = CASE
  WHEN plan = 'pro'        THEN 'pro'
  WHEN plan = 'enterprise' THEN 'enterprise'
  ELSE 'starter'
END
WHERE plan IS NOT NULL;
