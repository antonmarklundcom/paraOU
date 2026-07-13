import { prisma } from "../db.js";
import { logger } from "../log.js";
import { env } from "../env.js";
import { stripe, priceIdFor, planForPriceId, type BillablePlan, type BillingCycle } from "../stripe.js";
import { ApiError } from "./http.js";

/**
 * Stripe integration (PHASE-6 #2): Checkout for subscribe/upgrade, customer
 * portal for cancel/card-change, webhook → User.plan. `User.plan` is only ever
 * written here (and by the admin manual-override route) — never trust a client
 * to set it directly.
 */

export async function createCheckoutSession(
  userId: string,
  email: string,
  plan: BillablePlan,
  cycle: BillingCycle,
  appUrl: string,
): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const customerId =
    user.stripeCustomerId ??
    (await stripe().customers.create({ email, metadata: { userId } })).id;
  if (!user.stripeCustomerId) {
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceIdFor(plan, cycle), quantity: 1 }],
    success_url: `${appUrl}/cuenta?checkout=success`,
    cancel_url: `${appUrl}/precios?checkout=cancelled`,
    metadata: { userId, plan },
    allow_promotion_codes: true,
  });
  if (!session.url) throw new ApiError(502, "STRIPE_ERROR", "Stripe did not return a checkout URL");
  return session.url;
}

export async function createPortalSession(userId: string, appUrl: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.stripeCustomerId) {
    throw new ApiError(400, "NO_STRIPE_CUSTOMER", "No billing account yet — subscribe first");
  }
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl}/cuenta`,
  });
  return session.url;
}

/**
 * Applies a Stripe subscription's state to the matching User row. Idempotent —
 * safe to call for the same event more than once (Stripe retries webhooks).
 */
async function syncSubscriptionToUser(subscription: {
  id: string;
  customer: string;
  status: string;
  current_period_end?: number;
  items: { data: { price: { id: string } }[] };
}): Promise<void> {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer },
  });
  if (!user) {
    logger.warn({ customerId: subscription.customer }, "webhook for unknown Stripe customer");
    return;
  }

  const priceId = subscription.items.data[0]?.price.id;
  const priceDerivedPlan = priceId ? planForPriceId(priceId) : null;
  const active = subscription.status === "active" || subscription.status === "trialing";
  const resolvedPlan = active && priceDerivedPlan ? priceDerivedPlan : "FREE";

  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      // Only upgrade/keep the plan while active; a cancellation/expiry drops to
      // FREE. effectivePlan() in plan.ts is the belt-and-suspenders check that
      // reads subscriptionStatus even if this write is ever delayed/missed.
      plan: resolvedPlan,
    },
  });
  logger.info(
    { userId: user.id, status: subscription.status, plan: resolvedPlan },
    "synced Stripe subscription",
  );
}

/** Verifies the signature and dispatches the event. Throws on bad signature. */
export async function handleStripeWebhook(rawBody: string, signature: string): Promise<void> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new ApiError(503, "STRIPE_NOT_CONFIGURED", "Stripe webhook secret is not set");
  }
  const event = stripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe().subscriptions.retrieve(session.subscription as string);
        await syncSubscriptionToUser(sub as never);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await syncSubscriptionToUser(event.data.object as never);
      break;
    }
    default:
      // Unhandled event types are fine to ignore — Stripe sends many we don't act on.
      break;
  }
}
