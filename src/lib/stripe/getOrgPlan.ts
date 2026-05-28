'use server';

import { createClient } from '@/utils/supabase/server';
import type { PlanTier } from '@/lib/stripe';

export interface OrgPlan {
  planTier: PlanTier;
  subscriptionStatus: string;
  maxRoles: number | null;
  maxInterviewsPerMonth: number | null;
  transcriptExport: boolean;
  prioritySupport: boolean;
  whiteLabel: boolean;
  apiAccess: boolean;
}

const DEFAULTS: Record<PlanTier, Omit<OrgPlan, 'planTier' | 'subscriptionStatus'>> = {
  starter: {
    maxRoles: 3,
    maxInterviewsPerMonth: 30,
    transcriptExport: false,
    prioritySupport: false,
    whiteLabel: false,
    apiAccess: false,
  },
  pro: {
    maxRoles: null,
    maxInterviewsPerMonth: 150,
    transcriptExport: true,
    prioritySupport: true,
    whiteLabel: false,
    apiAccess: false,
  },
  enterprise: {
    maxRoles: null,
    maxInterviewsPerMonth: null,
    transcriptExport: true,
    prioritySupport: true,
    whiteLabel: true,
    apiAccess: true,
  },
};

/**
 * Returns the authenticated user's organization plan from the DB.
 * Falls back to 'starter' if not found.
 */
export async function getOrgPlan(): Promise<OrgPlan> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return buildPlan('starter', 'trialing');

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('user_id', user.id)
      .single();
    if (!profile?.org_id) return buildPlan('starter', 'trialing');

    const { data: org } = await supabase
      .from('organizations')
      .select('plan_tier, subscription_status')
      .eq('id', profile.org_id)
      .single();

    const tier   = (org?.plan_tier as PlanTier) ?? 'starter';
    const status = org?.subscription_status ?? 'trialing';

    // Treat past_due / canceled as starter for feature gating
    if (['canceled', 'incomplete_expired', 'unpaid'].includes(status)) {
      return buildPlan('starter', status);
    }

    return buildPlan(tier, status);
  } catch {
    return buildPlan('starter', 'trialing');
  }
}

function buildPlan(tier: PlanTier, status: string): OrgPlan {
  return { planTier: tier, subscriptionStatus: status, ...DEFAULTS[tier] };
}
