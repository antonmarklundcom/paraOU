import { z } from "zod";
import { prisma } from "../db.js";
import { limitsFor } from "../plan.js";
import { requestedChannels, whatsappAllowedByPlan } from "../alerts/channels.js";
import { maskPhone } from "../whatsapp/phone.js";
import { ApiError } from "./http.js";

/** Account settings + GDPR-style delete (PHASE-5 #6, gated per PHASE-6 #1). */

export const accountPrefsSchema = z.object({
  locale: z.enum(["es", "en"]),
  alertChannel: z.enum(["EMAIL", "WHATSAPP", "EMAIL_AND_WHATSAPP", "NONE"]),
  alertFrequency: z.enum(["INSTANT", "DAILY", "WEEKLY"]),
});
export type AccountPrefs = z.infer<typeof accountPrefsSchema>;

export async function updateAccountPrefs(userId: string, prefs: AccountPrefs) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const limits = limitsFor(user.plan);
  // The UI disables ungated options, but the plan is the real boundary — never
  // trust the client to only send an allowed frequency.
  if (!limits.allowedAlertFrequencies.includes(prefs.alertFrequency)) {
    throw new ApiError(
      403,
      "PLAN_LIMIT",
      `Your plan does not allow ${prefs.alertFrequency} alerts — upgrade at /precios`,
    );
  }
  // PHASE-F1: WhatsApp is a Business+ entitlement, and it can only be selected
  // once the number has actually completed the opt-in — otherwise a user could
  // silently switch their alerts off by picking a channel we cannot deliver on.
  if (requestedChannels(prefs.alertChannel).includes("whatsapp")) {
    // Uses the *effective* plan (a lapsed subscription reads as FREE) so a user
    // can never select a channel the alert engine would then refuse to deliver
    // on, which would silently end their alerts.
    if (!whatsappAllowedByPlan(user)) {
      throw new ApiError(
        403,
        "PLAN_LIMIT",
        "WhatsApp alerts are a Business feature — upgrade at /precios",
      );
    }
    if (user.whatsappStatus !== "VERIFIED" || !user.whatsappPhone) {
      throw new ApiError(
        400,
        "WHATSAPP_NOT_VERIFIED",
        "Verificá tu número de WhatsApp antes de elegir ese canal",
      );
    }
  }
  return prisma.user.update({ where: { id: userId }, data: prefs });
}

/** The WhatsApp half of the /cuenta settings payload (PHASE-F1 #5). */
export async function whatsappSettings(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      whatsappPhone: true,
      whatsappStatus: true,
      whatsappOtpExpiresAt: true,
      plan: true,
      manualBilling: true,
      subscriptionStatus: true,
    },
  });
  return {
    // Never return the full number to the browser — masked is enough to confirm
    // "yes, that's my phone" and keeps it out of client-side caches/logs.
    maskedPhone: user.whatsappPhone ? maskPhone(user.whatsappPhone) : null,
    status: user.whatsappStatus,
    pendingUntil: user.whatsappOtpExpiresAt?.toISOString() ?? null,
    allowedByPlan: whatsappAllowedByPlan(user),
  };
}

/**
 * Full account wipe: user, owned profiles/matches (cascade), saved searches,
 * follows, alert logs, WhatsApp messages, sessions/accounts. Prisma's
 * onDelete: Cascade on every relation handles the fan-out — deleting User is
 * enough.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}
