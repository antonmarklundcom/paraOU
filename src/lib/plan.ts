import type { Plan } from "@prisma/client";

/**
 * Plan gating (PHASE-6 #1) — the single source of truth for what each tier
 * unlocks. Every feature check in the app imports from here; never duplicate a
 * limit inline. Data itself is NEVER gated (docs/06, PHASE-6: "keep data
 * real-time for everyone; gate intelligence, not the public record" — better
 * for SEO/trust, and DNCP data is public anyway). Only AI matching depth, alert
 * speed, and premium analysis are paywalled.
 */

export interface PlanLimits {
  /** How many CompanyProfiles a user may create. */
  maxProfiles: number;
  /** Full match reasoning (fit_reasons/cautions) visible for at most this many
   * matches per day; beyond that the score shows but reasoning is blurred with
   * an upgrade prompt. `Infinity` = unlimited. */
  fullReasoningPerDay: number;
  /** Alert frequencies this plan may choose in /cuenta. */
  allowedAlertFrequencies: ("INSTANT" | "DAILY" | "WEEKLY")[];
  /** Full buyer/award history depth, or just a teaser. */
  fullBuyerHistory: boolean;
  /** "Analizar pliego" AI document analysis. */
  documentAnalysis: boolean;
  /** Multi-seat / competitor watchlists — UI-level flag for future work. */
  multiSeat: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    maxProfiles: 1,
    fullReasoningPerDay: 3,
    allowedAlertFrequencies: ["WEEKLY"],
    fullBuyerHistory: false,
    documentAnalysis: false,
    multiSeat: false,
  },
  PRO: {
    maxProfiles: 1,
    fullReasoningPerDay: Infinity,
    allowedAlertFrequencies: ["INSTANT", "DAILY", "WEEKLY"],
    fullBuyerHistory: true,
    documentAnalysis: false,
    multiSeat: false,
  },
  BUSINESS: {
    maxProfiles: 3,
    fullReasoningPerDay: Infinity,
    allowedAlertFrequencies: ["INSTANT", "DAILY", "WEEKLY"],
    fullBuyerHistory: true,
    documentAnalysis: true,
    multiSeat: true,
  },
  AGENCY: {
    maxProfiles: Infinity,
    fullReasoningPerDay: Infinity,
    allowedAlertFrequencies: ["INSTANT", "DAILY", "WEEKLY"],
    fullBuyerHistory: true,
    documentAnalysis: true,
    multiSeat: true,
  },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

/** Effective plan for gating purposes — a canceled/past_due Stripe subscription
 * (unless manually billed) reads as FREE regardless of the stored `plan`, so a
 * lapsed payment degrades gracefully instead of trusting a stale column. */
export function effectivePlan(user: {
  plan: Plan;
  manualBilling: boolean;
  subscriptionStatus: string | null;
}): Plan {
  if (user.plan === "FREE" || user.manualBilling) return user.plan;
  if (user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing") {
    return user.plan;
  }
  return "FREE";
}

export const PRICING = {
  FREE: { usd: 0, label: "Gratis" },
  PRO: { usd: 29, label: "Pro" },
  BUSINESS: { usd: 99, label: "Business" },
  AGENCY: { usd: 299, label: "Agencia / API" },
} as const;
