import Stripe from "stripe";
import type { Plan } from "@prisma/client";
import { env, stripeConfigured } from "./env.js";

/**
 * Stripe client + price/plan mapping (PHASE-6 #2). Optional per CLAUDE.md rule 2:
 * without STRIPE_SECRET_KEY every billing route responds with a clear
 * "not configured" error instead of crashing the app.
 */

let client: Stripe | null = null;
export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set — billing is not configured (see .env.example)");
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export type BillablePlan = "PRO" | "BUSINESS";
export type BillingCycle = "monthly" | "annual";

/** Annual = 2 months free (docs/00) — each price id is a real Stripe Price the
 * owner creates in the dashboard, so Stripe handles proration/renewal itself. */
export function priceIdFor(plan: BillablePlan, cycle: BillingCycle): string {
  const key = `STRIPE_PRICE_${plan}_${cycle === "monthly" ? "MONTHLY" : "ANNUAL"}` as const;
  const id = env[key];
  if (!id) {
    throw new Error(`${key} is not set — create the Price in the Stripe dashboard first`);
  }
  return id;
}

const PRICE_TO_PLAN: Partial<Record<string, BillablePlan>> = {};
function priceToPlanMap(): Partial<Record<string, BillablePlan>> {
  if (Object.keys(PRICE_TO_PLAN).length > 0) return PRICE_TO_PLAN;
  const entries: [string | undefined, BillablePlan][] = [
    [env.STRIPE_PRICE_PRO_MONTHLY, "PRO"],
    [env.STRIPE_PRICE_PRO_ANNUAL, "PRO"],
    [env.STRIPE_PRICE_BUSINESS_MONTHLY, "BUSINESS"],
    [env.STRIPE_PRICE_BUSINESS_ANNUAL, "BUSINESS"],
  ];
  for (const [id, plan] of entries) {
    if (id) PRICE_TO_PLAN[id] = plan;
  }
  return PRICE_TO_PLAN;
}

/** Maps a Stripe subscription's price back to our Plan enum. */
export function planForPriceId(priceId: string): Plan | null {
  return priceToPlanMap()[priceId] ?? null;
}

export { stripeConfigured };
