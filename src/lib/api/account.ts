import { z } from "zod";
import { prisma } from "../db.js";
import { limitsFor } from "../plan.js";
import { ApiError } from "./http.js";

/** Account settings + GDPR-style delete (PHASE-5 #6, gated per PHASE-6 #1). */

export const accountPrefsSchema = z.object({
  locale: z.enum(["es", "en"]),
  alertChannel: z.enum(["EMAIL", "NONE"]),
  alertFrequency: z.enum(["INSTANT", "DAILY", "WEEKLY"]),
});
export type AccountPrefs = z.infer<typeof accountPrefsSchema>;

export async function updateAccountPrefs(userId: string, prefs: AccountPrefs) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // The UI disables ungated options, but the plan is the real boundary — never
  // trust the client to only send an allowed frequency.
  if (!limitsFor(user.plan).allowedAlertFrequencies.includes(prefs.alertFrequency)) {
    throw new ApiError(
      403,
      "PLAN_LIMIT",
      `Your plan does not allow ${prefs.alertFrequency} alerts — upgrade at /precios`,
    );
  }
  return prisma.user.update({ where: { id: userId }, data: prefs });
}

/**
 * Full account wipe: user, owned profiles/matches (cascade), saved searches,
 * follows, alert logs, sessions/accounts. Prisma's onDelete: Cascade on every
 * Phase 5 relation handles the fan-out — deleting User is enough.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}
