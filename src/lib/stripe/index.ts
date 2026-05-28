import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
});

// ─── Plan → Price ID map ────────────────────────────────────────────────────

export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

export const PRICE_IDS: Record<PlanTier, Record<BillingInterval, string>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    yearly:  process.env.STRIPE_PRICE_STARTER_YEARLY!,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    yearly:  process.env.STRIPE_PRICE_PRO_YEARLY!,
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
    yearly:  process.env.STRIPE_PRICE_ENTERPRISE_YEARLY!,
  },
};

// Reverse map: priceId → { tier, interval }
export const PRICE_TIER_MAP: Record<string, { tier: PlanTier; interval: BillingInterval }> = {};
for (const [tier, intervals] of Object.entries(PRICE_IDS)) {
  for (const [interval, priceId] of Object.entries(intervals)) {
    PRICE_TIER_MAP[priceId] = {
      tier: tier as PlanTier,
      interval: interval as BillingInterval,
    };
  }
}

// ─── Plan limits ─────────────────────────────────────────────────────────────

export const PLAN_LIMITS: Record<PlanTier, {
  maxInterviewsPerMonth: number | null;
  maxRoles: number | null;
  transcriptExport: boolean;
  prioritySupport: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
}> = {
  starter: {
    maxInterviewsPerMonth: 30,
    maxRoles: 3,
    transcriptExport: false,
    prioritySupport: false,
    whiteLabel: false,
    apiAccess: false,
  },
  pro: {
    maxInterviewsPerMonth: 150,
    maxRoles: null,
    transcriptExport: true,
    prioritySupport: true,
    whiteLabel: false,
    apiAccess: false,
  },
  enterprise: {
    maxInterviewsPerMonth: null,
    maxRoles: null,
    transcriptExport: true,
    prioritySupport: true,
    whiteLabel: true,
    apiAccess: true,
  },
};
