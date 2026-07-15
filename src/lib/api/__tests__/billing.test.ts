// STRIPE_* env vars are set via vitest.config.ts `test.env` (guaranteed before any
// module in this file's graph loads — see that file for why not a top-of-file
// process.env assignment here).
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { prisma } from "../../db.js";
import { handleStripeWebhook } from "../billing.js";
import { planForPriceId, priceIdFor } from "../../stripe.js";

/**
 * Stripe webhook signature verification + subscription sync (PHASE-6 acceptance:
 * "webhook signature verified; all covered by tests using Stripe CLI fixtures").
 * `Stripe.webhooks.generateTestHeaderString` is the same helper the Stripe CLI
 * uses — no live account or network call needed.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET as string;

function signedEvent(payload: unknown): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: WEBHOOK_SECRET,
  });
  return { rawBody, signature };
}

function subscriptionEvent(overrides: {
  id: string;
  customer: string;
  status: string;
  priceId: string;
}) {
  return {
    id: "evt_test_1",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: overrides.id,
        customer: overrides.customer,
        status: overrides.status,
        current_period_end: 2000000000,
        items: { data: [{ price: { id: overrides.priceId } }] },
      },
    },
  };
}

describe("priceIdFor / planForPriceId", () => {
  it("maps plan+cycle to the configured price id and back to the plan", () => {
    const id = priceIdFor("PRO", "monthly");
    expect(id).toBe("price_pro_monthly");
    expect(planForPriceId(id)).toBe("PRO");
    expect(planForPriceId(priceIdFor("BUSINESS", "annual"))).toBe("BUSINESS");
  });

  it("returns null for an unknown price id", () => {
    expect(planForPriceId("price_does_not_exist")).toBeNull();
  });
});

describe.skipIf(!hasDb)("handleStripeWebhook (integration)", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: "stripe-test" } } });
  });
  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: "stripe-test" } } });
  });

  it("rejects a payload with a bad signature", async () => {
    const { rawBody } = signedEvent(
      subscriptionEvent({
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        priceId: "price_pro_monthly",
      }),
    );
    await expect(handleStripeWebhook(rawBody, "t=1,v1=deadbeef")).rejects.toThrow();
  });

  it("upgrades the user's plan on an active subscription event", async () => {
    const user = await prisma.user.create({
      data: { email: "stripe-test-1@example.com", stripeCustomerId: "cus_upgrade" },
    });
    const { rawBody, signature } = signedEvent(
      subscriptionEvent({
        id: "sub_upgrade",
        customer: "cus_upgrade",
        status: "active",
        priceId: "price_pro_monthly",
      }),
    );
    await handleStripeWebhook(rawBody, signature);

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.plan).toBe("PRO");
    expect(reloaded.subscriptionStatus).toBe("active");
    expect(reloaded.stripeSubscriptionId).toBe("sub_upgrade");
  });

  it("downgrades to FREE when the subscription is canceled", async () => {
    const user = await prisma.user.create({
      data: {
        email: "stripe-test-2@example.com",
        stripeCustomerId: "cus_cancel",
        plan: "BUSINESS",
        subscriptionStatus: "active",
      },
    });
    const { rawBody, signature } = signedEvent(
      subscriptionEvent({
        id: "sub_cancel",
        customer: "cus_cancel",
        status: "canceled",
        priceId: "price_business_monthly",
      }),
    );
    await handleStripeWebhook(rawBody, signature);

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.plan).toBe("FREE");
    expect(reloaded.subscriptionStatus).toBe("canceled");
  });

  it("is idempotent — re-delivering the same event twice is a no-op the second time", async () => {
    const user = await prisma.user.create({
      data: { email: "stripe-test-3@example.com", stripeCustomerId: "cus_idem" },
    });
    const { rawBody, signature } = signedEvent(
      subscriptionEvent({
        id: "sub_idem",
        customer: "cus_idem",
        status: "active",
        priceId: "price_business_annual",
      }),
    );
    await handleStripeWebhook(rawBody, signature);
    await handleStripeWebhook(rawBody, signature);

    const reloaded = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(reloaded.plan).toBe("BUSINESS");
  });

  it("ignores a webhook for an unknown Stripe customer instead of throwing", async () => {
    const { rawBody, signature } = signedEvent(
      subscriptionEvent({
        id: "sub_ghost",
        customer: "cus_does_not_exist",
        status: "active",
        priceId: "price_pro_monthly",
      }),
    );
    await expect(handleStripeWebhook(rawBody, signature)).resolves.toBeUndefined();
  });
});
