import { z } from "zod";
import { auth } from "../auth.js";
import { prisma } from "../db.js";
import { isAdminEmail } from "../env.js";
import { ApiError } from "./http.js";

/** /admin session gate (PHASE-6 #5) — replaces the Phase 4 ADMIN_KEY query param
 * with real session-based access control now that accounts exist. */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    throw new ApiError(403, "FORBIDDEN", "Admin access required");
  }
  return { userId: session.user.id, email: session.user.email };
}

export const planOverrideSchema = z.object({
  userId: z.string().min(1),
  plan: z.enum(["FREE", "PRO", "BUSINESS", "AGENCY"]),
  manualBilling: z.boolean(),
});

/** Manual plan override (PHASE-6 #2: "manual-invoice flag ... for B2B
 * bank-transfer deals"). Setting manualBilling=true means the webhook's
 * subscription-status checks are bypassed for this user going forward. */
export async function overridePlan(input: z.infer<typeof planOverrideSchema>) {
  return prisma.user.update({
    where: { id: input.userId },
    data: { plan: input.plan, manualBilling: input.manualBilling },
  });
}
