import Stripe from 'stripe';

let _stripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
      typescript: true,
    });
  }
  return _stripe;
}

/** @deprecated Use `getStripe()` instead — kept for backward compatibility */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});

// ─── Plan → Price ID map ────────────────────────────────────────────────────

export type PlanTier = 'starter' | 'pro' | 'enterprise';
export type BillingInterval = 'monthly' | 'yearly';

function getPriceIds(): Record<PlanTier, Record<BillingInterval, string>> {
  return {
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
}

export const PRICE_IDS = new Proxy({} as Record<PlanTier, Record<BillingInterval, string>>, {
  get(_target, prop, receiver) {
    return Reflect.get(getPriceIds(), prop, receiver);
  },
});

// Reverse map: priceId → { tier, interval }
function getPriceTierMap(): Record<string, { tier: PlanTier; interval: BillingInterval }> {
  const map: Record<string, { tier: PlanTier; interval: BillingInterval }> = {};
  for (const [tier, intervals] of Object.entries(getPriceIds())) {
    for (const [interval, priceId] of Object.entries(intervals)) {
      map[priceId] = {
        tier: tier as PlanTier,
        interval: interval as BillingInterval,
      };
    }
  }
  return map;
}

export const PRICE_TIER_MAP = new Proxy({} as Record<string, { tier: PlanTier; interval: BillingInterval }>, {
  get(_target, prop, receiver) {
    return Reflect.get(getPriceTierMap(), prop, receiver);
  },
});

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
