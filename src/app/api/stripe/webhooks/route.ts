import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRICE_TIER_MAP } from '@/lib/stripe';
import { createClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

/**
 * Create a Supabase client for webhook use.
 * Uses the anon key — RLS is bypassed via the SECURITY DEFINER function
 * `update_org_subscription()` so no service_role key is needed.
 */
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** In Stripe v22 (dahlia), period_end lives on the first SubscriptionItem */
function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;
  const ts = (item as Stripe.SubscriptionItem & { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

/**
 * Update org subscription via the SECURITY DEFINER function.
 * This bypasses RLS even with the anon key.
 */
async function updateOrgSubscription(params: {
  orgId?: string;
  lookupByCustomer?: string;
  lookupBySubscription?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string | null;
  planTier?: string;
  billingInterval?: string;
  subscriptionStatus?: string;
  subscriptionPeriodEnd?: string | null;
}) {
  const supabase = getSupabase();
  const { error } = await supabase.rpc('update_org_subscription', {
    p_org_id:                   params.orgId ?? null,
    p_stripe_customer_id:       params.stripeCustomerId ?? null,
    p_stripe_subscription_id:   params.stripeSubscriptionId === null ? '__CLEAR__' : (params.stripeSubscriptionId ?? null),
    p_plan_tier:                params.planTier ?? null,
    p_billing_interval:         params.billingInterval ?? null,
    p_subscription_status:      params.subscriptionStatus ?? null,
    p_subscription_period_end:  params.subscriptionPeriodEnd === null ? '1970-01-01T00:00:00Z' : (params.subscriptionPeriodEnd ?? null),
    p_lookup_by_customer:       params.lookupByCustomer ?? null,
    p_lookup_by_subscription:   params.lookupBySubscription ?? null,
  });

  if (error) {
    console.error('[stripe/webhooks] RPC update_org_subscription error:', error);
  }
}

export async function POST(req: NextRequest) {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('[stripe/webhooks] signature verification failed:', err);
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  try {
    switch (event.type) {
      // ── Checkout completed ────────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        const orgId          = session.metadata?.org_id;
        const subscriptionId = session.subscription as string;
        const customerId     = session.customer as string;

        if (!orgId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId      = subscription.items.data[0]?.price.id ?? '';
        const tierInfo     = PRICE_TIER_MAP[priceId];

        await updateOrgSubscription({
          orgId,
          stripeCustomerId:      customerId,
          stripeSubscriptionId:  subscriptionId,
          planTier:              tierInfo?.tier ?? 'starter',
          billingInterval:       tierInfo?.interval ?? 'monthly',
          subscriptionStatus:    subscription.status,
          subscriptionPeriodEnd: getPeriodEnd(subscription),
        });

        console.log(`[stripe/webhooks] checkout.session.completed → org ${orgId} → ${tierInfo?.tier}`);
        break;
      }

      // ── Subscription updated (upgrade / downgrade / renewal) ─────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId        = subscription.metadata?.org_id;
        const priceId      = subscription.items.data[0]?.price.id ?? '';
        const tierInfo     = PRICE_TIER_MAP[priceId];

        await updateOrgSubscription({
          orgId:                  orgId || undefined,
          lookupBySubscription:   orgId ? undefined : subscription.id,
          planTier:               tierInfo?.tier ?? 'starter',
          billingInterval:        tierInfo?.interval ?? 'monthly',
          subscriptionStatus:     subscription.status,
          subscriptionPeriodEnd:  getPeriodEnd(subscription),
        });

        console.log(`[stripe/webhooks] subscription.updated → org ${orgId ?? 'by sub_id'} → ${tierInfo?.tier} (${subscription.status})`);
        break;
      }

      // ── Subscription deleted / canceled ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const orgId        = subscription.metadata?.org_id;

        await updateOrgSubscription({
          orgId:                  orgId || undefined,
          lookupBySubscription:   orgId ? undefined : subscription.id,
          planTier:               'starter',
          billingInterval:        'monthly',
          subscriptionStatus:     'canceled',
          stripeSubscriptionId:   null,
          subscriptionPeriodEnd:  null,
        });

        console.log(`[stripe/webhooks] subscription.deleted → org ${orgId ?? 'unknown'} → downgraded to starter`);
        break;
      }

      // ── Payment failed ────────────────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        await updateOrgSubscription({
          lookupByCustomer:  customerId,
          subscriptionStatus: 'past_due',
        });

        console.log(`[stripe/webhooks] invoice.payment_failed → customer ${customerId}`);
        break;
      }

      // ── Payment succeeded (renewal) ───────────────────────────────────────
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const parent  = invoice.parent as Stripe.Invoice.Parent | null;
        const subDetails = parent?.subscription_details as { subscription?: string | Stripe.Subscription } | undefined;
        const subId = subDetails?.subscription;

        if (!subId) break;

        const subscription = await stripe.subscriptions.retrieve(
          typeof subId === 'string' ? subId : subId.id
        );

        await updateOrgSubscription({
          lookupByCustomer:      invoice.customer as string,
          subscriptionStatus:    'active',
          subscriptionPeriodEnd: getPeriodEnd(subscription),
        });
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhooks] error handling ${event.type}:`, err);
    return NextResponse.json({ error: 'Webhook handler error' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
