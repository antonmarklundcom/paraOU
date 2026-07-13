import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { createPortalSession } from "@/lib/api/billing";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { stripeConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Stripe customer portal: cancel, change card, view invoices (PHASE-6 #2). */
export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  if (!stripeConfigured()) {
    throw new ApiError(503, "BILLING_NOT_CONFIGURED", "Billing is not configured yet");
  }
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  const appUrl = new URL(req.url).origin;
  const url = await createPortalSession(session.user.id, appUrl);
  return ok({ url });
});
