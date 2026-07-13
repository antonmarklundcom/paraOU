import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { createCheckoutSession } from "@/lib/api/billing";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { stripeConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  plan: z.enum(["PRO", "BUSINESS"]),
  cycle: z.enum(["monthly", "annual"]),
});

export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  if (!stripeConfigured()) {
    throw new ApiError(503, "BILLING_NOT_CONFIGURED", "Billing is not configured yet");
  }
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  }
  const { plan, cycle } = bodySchema.parse(await req.json());
  const appUrl = new URL(req.url).origin;
  const url = await createCheckoutSession(session.user.id, session.user.email, plan, cycle, appUrl);
  return ok({ url });
});
