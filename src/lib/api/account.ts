import { z } from "zod";
import { prisma } from "../db.js";

/** Account settings + GDPR-style delete (PHASE-5 #6). */

export const accountPrefsSchema = z.object({
  locale: z.enum(["es", "en"]),
  alertChannel: z.enum(["EMAIL", "NONE"]),
  alertFrequency: z.enum(["INSTANT", "DAILY", "WEEKLY"]),
});
export type AccountPrefs = z.infer<typeof accountPrefsSchema>;

export async function updateAccountPrefs(userId: string, prefs: AccountPrefs) {
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
