import { describe, expect, it } from "vitest";
import { effectivePlan, limitsFor, PLAN_LIMITS } from "../plan.js";

describe("limitsFor", () => {
  it("FREE caps profiles at 1 and full reasoning at 3/day", () => {
    const l = limitsFor("FREE");
    expect(l.maxProfiles).toBe(1);
    expect(l.fullReasoningPerDay).toBe(3);
    expect(l.allowedAlertFrequencies).toEqual(["WEEKLY"]);
    expect(l.documentAnalysis).toBe(false);
    expect(l.plannedPurchases).toBe(false);
    expect(l.whatsappAlerts).toBe(false);
  });

  it("PRO unlocks full reasoning and all alert frequencies but keeps 1 profile", () => {
    const l = limitsFor("PRO");
    expect(l.maxProfiles).toBe(1);
    expect(l.fullReasoningPerDay).toBe(Infinity);
    expect(l.allowedAlertFrequencies).toEqual(["INSTANT", "DAILY", "WEEKLY"]);
    expect(l.plannedPurchases).toBe(false);
    // WhatsApp is the Business-tier promise (docs/00), not a Pro feature.
    expect(l.whatsappAlerts).toBe(false);
  });

  it("BUSINESS unlocks 3 profiles, document analysis, PAC and WhatsApp alerts", () => {
    const l = limitsFor("BUSINESS");
    expect(l.maxProfiles).toBe(3);
    expect(l.documentAnalysis).toBe(true);
    expect(l.multiSeat).toBe(true);
    expect(l.plannedPurchases).toBe(true);
    expect(l.whatsappAlerts).toBe(true);
  });

  it("AGENCY has no profile cap and keeps every Business entitlement", () => {
    expect(limitsFor("AGENCY").maxProfiles).toBe(Infinity);
    expect(limitsFor("AGENCY").whatsappAlerts).toBe(true);
  });

  it("every plan enum value has an entry", () => {
    expect(Object.keys(PLAN_LIMITS).sort()).toEqual(["AGENCY", "BUSINESS", "FREE", "PRO"]);
  });
});

describe("effectivePlan", () => {
  it("FREE users always read as FREE regardless of subscriptionStatus", () => {
    expect(
      effectivePlan({ plan: "FREE", manualBilling: false, subscriptionStatus: "canceled" }),
    ).toBe("FREE");
  });

  it("manualBilling users keep their stored plan regardless of Stripe state", () => {
    expect(effectivePlan({ plan: "BUSINESS", manualBilling: true, subscriptionStatus: null })).toBe(
      "BUSINESS",
    );
  });

  it("active/trialing subscriptions keep the paid plan", () => {
    expect(effectivePlan({ plan: "PRO", manualBilling: false, subscriptionStatus: "active" })).toBe(
      "PRO",
    );
    expect(
      effectivePlan({ plan: "PRO", manualBilling: false, subscriptionStatus: "trialing" }),
    ).toBe("PRO");
  });

  it("a lapsed/canceled/past_due subscription degrades to FREE even if plan is stale", () => {
    for (const status of ["canceled", "past_due", "unpaid", null]) {
      expect(
        effectivePlan({ plan: "BUSINESS", manualBilling: false, subscriptionStatus: status }),
      ).toBe("FREE");
    }
  });
});
