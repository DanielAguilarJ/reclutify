import { NextRequest, NextResponse } from 'next/server';
import { stripe, PRICE_TIER_MAP } from '@/lib/stripe';
import { createAdminClient } from '@/utils/supabase/admin';
import type Stripe from 'stripe';

/** In Stripe v22 (dahlia), period_end lives on the first SubscriptionItem */
function getPeriodEnd(subscription: Stripe.Subscription): string | null {
  const item = subscription.items?.data?.[0];
  if (!item) return null;
  const ts = (item as Stripe.SubscriptionItem & { current_period_end?: number }).current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

/**
 * `customer` llega como id o como objeto expandido según el evento (y como
 * `null` en facturas sin cliente). El `as string` de antes se creía el id
 * siempre: con un objeto expandido acabaría comparando o consultando por
 * `"[object Object]"`.
 */
function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined,
): string | null {
  if (!customer) return null;
  return typeof customer === 'string' ? customer : customer.id;
}

/**
 * Update org subscription via the SECURITY DEFINER function.
 *
 * MUST run with `service_role`. The RPC `update_org_subscription()` writes
 * subscription state from caller-supplied parameters with no identity check,
 * so `EXECUTE` is being revoked from `anon` and `authenticated`
 * (`supabase/migrations/202607290002_stripe_revoke_anon_execute.sql`).
 * `createAdminClient()` requires `SUPABASE_SERVICE_ROLE_KEY` and throws when
 * it is missing — there is deliberately no anon-key fallback: falling back
 * would only work while the function stays open to the public API key, which
 * is the vulnerability being closed.
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
  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch (err) {
    // The POST handler turns this into a 500 (so Stripe retries), which on its
    // own is indistinguishable from any other handler failure. Log the real
    // cause explicitly: the webhook is misconfigured, not the event.
    console.error(
      '[stripe/webhooks] misconfigured: SUPABASE_SERVICE_ROLE_KEY is required to call update_org_subscription — the anon-key fallback was removed on purpose:',
      err
    );
    throw err;
  }

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
    // Mismo contrato que la mala configuración de arriba: registrar la causa y
    // relanzar, para que el `catch` del POST responda 500 y Stripe reintente.
    //
    // Antes se registraba y se seguía. El handler terminaba devolviendo
    // `{ received: true }` con 200, así que Stripe daba el evento por entregado
    // y no volvía a intentarlo: la escritura perdida quedaba en silencio y la
    // organización se quedaba con un estado obsoleto — quien pagó sigue en
    // `starter`, quien canceló conserva su plan de pago. Un log en un servidor
    // no cobra ni deja de cobrar; el 500 sí hace que Stripe reintente.
    console.error('[stripe/webhooks] RPC update_org_subscription error:', error);
    throw new Error(`update_org_subscription failed: ${error.message}`);
  }
}

/**
 * IDEMPOTENCIA — por qué NO se deduplica por `event.id`.
 * ---------------------------------------------------------------------------
 * Ahora que un fallo de escritura devuelve 500, Stripe reintenta el mismo
 * `event.id` hasta que la entrega se acepta. Reaplicarlo es inofensivo:
 * `update_org_subscription()` solo hace un UPDATE de estado absoluto
 * (`plan_tier`, `subscription_status`, `subscription_period_end`, ids de
 * Stripe) con COALESCE por parámetro. No inserta filas, no incrementa
 * contadores y no aplica deltas, así que ejecutarla N veces con el mismo
 * payload deja la fila exactamente igual que ejecutarla una vez.
 *
 * Un registro de eventos vistos, además de exigir tabla y migración nuevas,
 * sería un riesgo neto: si se marcase el `event.id` antes de escribir, el
 * reintento se descartaría sin haber aplicado nada — el mismo silencio que este
 * cambio elimina. Y no resuelve el problema que sí existe (ver abajo), porque
 * dos eventos desordenados llevan ids distintos.
 *
 * ORDEN DE EVENTOS — riesgo real, no se arregla en este tramo.
 * ---------------------------------------------------------------------------
 * Stripe no garantiza el orden de entrega. Un `customer.subscription.updated`
 * retrasado o reintentado que llega después de `customer.subscription.deleted`
 * escribe el plan y el estado de su payload viejo sobre un estado más reciente:
 *
 *   - con `metadata.org_id`, el UPDATE apunta a esa org y la resucita al plan
 *     de pago que ya estaba cancelado;
 *   - sin `metadata.org_id`, el `lookupBySubscription` no encuentra fila porque
 *     el delete ya limpió `stripe_subscription_id`, y el evento queda en no-op.
 *
 * Descartar lo viejo exige comparar la marca temporal del evento con la última
 * aplicada, o sea una columna nueva en `organizations` (p. ej.
 * `stripe_event_at`) y su migración: fuera del alcance de este cambio.
 */
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
        const customerId = customerIdOf(invoice.customer);

        if (!customerId) {
          console.warn('[stripe/webhooks] invoice.payment_failed sin cliente: nada que actualizar');
          break;
        }

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

        const invoiceCustomerId = customerIdOf(invoice.customer);
        if (!invoiceCustomerId) {
          console.warn('[stripe/webhooks] invoice.payment_succeeded sin cliente: nada que actualizar');
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(
          typeof subId === 'string' ? subId : subId.id
        );

        // La org se resuelve por `lookupByCustomer` (el cliente de la factura),
        // pero el `period_end` sale de la suscripción recuperada por id. Si esos
        // dos objetos no son del mismo cliente se estaría escribiendo el periodo
        // de una suscripción ajena sobre esta organización, y marcándola
        // `active` por un cobro que no es suyo. Un desajuste no es transitorio:
        // reintentar daría el mismo resultado, así que se descarta el evento en
        // lugar de devolver 500.
        const subscriptionCustomerId = customerIdOf(subscription.customer);
        if (subscriptionCustomerId !== invoiceCustomerId) {
          console.error(
            `[stripe/webhooks] invoice.payment_succeeded descartado: la suscripción ${subscription.id} pertenece al cliente ${subscriptionCustomerId ?? 'desconocido'}, no a ${invoiceCustomerId}`
          );
          break;
        }

        await updateOrgSubscription({
          lookupByCustomer:      invoiceCustomerId,
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
