import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRICE_IDS, type PlanTier, type BillingInterval } from '@/lib/stripe';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { tier, interval = 'monthly' } = body as {
      tier: PlanTier;
      interval?: BillingInterval;
    };

    if (!tier || !PRICE_IDS[tier]) {
      return NextResponse.json({ error: 'Invalid plan tier' }, { status: 400 });
    }

    // Fetch user profile + org
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id, full_name')
      .eq('user_id', user.id)
      .single();

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'No organization found. Complete onboarding first.' }, { status: 400 });
    }

    // Fetch org to get or create Stripe customer
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, stripe_customer_id, stripe_subscription_id, plan_tier')
      .eq('id', profile.org_id)
      .single();

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    const appUrl  = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const priceId = PRICE_IDS[tier][interval];

    // ─── CASE 1: Already on the same plan → redirect to billing portal ────
    if (org.plan_tier === tier && org.stripe_subscription_id) {
      const session = await stripe.billingPortal.sessions.create({
        customer: org.stripe_customer_id!,
        return_url: `${appUrl}/admin/settings`,
      });
      return NextResponse.json({ url: session.url });
    }

    // ─── CASE 2: Has existing subscription → update it (upgrade/downgrade) ─
    if (org.stripe_subscription_id && org.stripe_customer_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);

        // Only update if the subscription is still active/trialing
        if (['active', 'trialing', 'past_due'].includes(subscription.status)) {
          const currentItemId = subscription.items.data[0]?.id;

          if (currentItemId) {
            // Update the subscription item to the new price (with proration)
            await stripe.subscriptions.update(org.stripe_subscription_id, {
              items: [{
                id: currentItemId,
                price: priceId,
              }],
              proration_behavior: 'create_prorations',
              metadata: {
                org_id: org.id,
                tier,
                interval,
              },
            });

            // Redirect to settings with upgrade success
            return NextResponse.json({
              url: `${appUrl}/admin/settings?checkout=success&upgraded=true`,
            });
          }
        }
      } catch (err) {
        // If subscription update fails (e.g., sub was already canceled),
        // fall through to create a new checkout session
        console.warn('[stripe/checkout] subscription update failed, creating new checkout:', err);
      }
    }

    // ─── CASE 3: No existing subscription → create Checkout Session ────────

    // Reuse or create Stripe customer
    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: {
          org_id: org.id,
          user_id: user.id,
        },
      });
      customerId = customer.id;

      // Persist customer ID immediately
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customerId })
        .eq('id', org.id);
    }

    // Create Checkout Session for new subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/admin/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}/pricing?checkout=canceled`,
      metadata: {
        org_id:   org.id,
        tier,
        interval,
      },
      subscription_data: {
        metadata: {
          org_id:   org.id,
          tier,
          interval,
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('[stripe/checkout]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    );
  }
}
