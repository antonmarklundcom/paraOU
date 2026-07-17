import { z } from "zod";
import { prisma } from "../db.js";

export const accountUpdateSchema = z.object({
  locale: z.enum(["es", "en"]).optional(),
  alertChannel: z.enum(["EMAIL", "NONE"]).optional(),
  alertFrequency: z.enum(["INSTANT", "DAILY", "WEEKLY", "NONE"]).optional(),
});

export async function updateAccount(userId: string, input: z.infer<typeof accountUpdateSchema>) {
  return prisma.user.update({ where: { id: userId }, data: input });
}

/** GDPR-style full wipe (PHASE-5 step 6). Cascades to accounts/sessions/profiles/
 * matches/saved searches/follows/alert log via the FK onDelete: Cascade chains
 * declared in schema.prisma. */
export async function deleteAccount(userId: string): Promise<void> {
  await prisma.user.delete({ where: { id: userId } });
}
