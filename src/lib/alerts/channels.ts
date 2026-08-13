import type { AlertChannel, Plan, WhatsappStatus } from "@prisma/client";
import { effectivePlan, limitsFor } from "../plan.js";

/**
 * Delivery-channel resolution (PHASE-F1 #1): email and WhatsApp are two
 * implementations of one abstraction, not two alert systems. The engine asks
 * this module "which channels should this user actually receive on right now?",
 * and every reason a channel can be unavailable — plan gating, a bounced email,
 * an unverified/failed/opted-out WhatsApp number — is answered in one place.
 *
 * AlertLog already keys dedupe by `channel`, so each channel gets its own
 * exactly-once guarantee: a user on EMAIL_AND_WHATSAPP is told about a tender
 * once per channel, and a WhatsApp send that fails is retried next tick without
 * re-sending the email.
 */

export type DeliveryChannel = "email" | "whatsapp";

/** Which channels the user's stored preference asks for, before any checks. */
export function requestedChannels(alertChannel: AlertChannel): DeliveryChannel[] {
  switch (alertChannel) {
    case "EMAIL":
      return ["email"];
    case "WHATSAPP":
      return ["whatsapp"];
    case "EMAIL_AND_WHATSAPP":
      return ["email", "whatsapp"];
    case "NONE":
      return [];
  }
}

export interface ChannelEligibilityUser {
  alertChannel: AlertChannel;
  emailBounced: boolean;
  plan: Plan;
  manualBilling: boolean;
  subscriptionStatus: string | null;
  whatsappPhone: string | null;
  whatsappStatus: WhatsappStatus;
}

/** True when the user's *effective* plan includes the WhatsApp channel. */
export function whatsappAllowedByPlan(user: {
  plan: Plan;
  manualBilling: boolean;
  subscriptionStatus: string | null;
}): boolean {
  return limitsFor(effectivePlan(user)).whatsappAlerts;
}

/**
 * The channels a digest may actually be delivered on. Order matters only for
 * logging; each channel is independent.
 */
export function eligibleChannels(user: ChannelEligibilityUser): DeliveryChannel[] {
  return requestedChannels(user.alertChannel).filter((channel) => {
    if (channel === "email") return !user.emailBounced;
    // WhatsApp: Business+ only, and only to a number that completed the opt-in
    // OTP and has not since bounced (FAILED) or opted out (STOP/BAJA).
    return (
      Boolean(user.whatsappPhone) &&
      user.whatsappStatus === "VERIFIED" &&
      whatsappAllowedByPlan(user)
    );
  });
}

/**
 * The preference to store when WhatsApp stops being a valid destination (opt-out,
 * bounce, plan downgrade, or the user removing their number). Alerts fall back to
 * email rather than going silent — the account already receives transactional
 * email, and silently ending someone's alerts is worse than the wrong channel.
 */
export function channelWithoutWhatsapp(current: AlertChannel): AlertChannel {
  return current === "WHATSAPP" || current === "EMAIL_AND_WHATSAPP" ? "EMAIL" : current;
}
