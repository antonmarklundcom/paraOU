import type { Plan } from "@prisma/client";
import { auth } from "@/lib/auth";
import { limitsFor } from "@/lib/plan";
import { ApiError, handle, ok, parseQuery } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { plannedPurchaseQuerySchema, searchPlannedPurchases } from "@/lib/api/plannedPurchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/planificacion — PAC "planned purchases" feed (F3). Business-tier
 * gated (docs/07 #1, src/lib/plan.ts `plannedPurchases`): unlike the free public
 * Tender list, this is sold intelligence, so it requires sign-in + plan check. */
export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  if (!limitsFor(session.user.plan as Plan).plannedPurchases) {
    throw new ApiError(
      403,
      "PLAN_LIMIT",
      "Planned purchases (PAC early-warning) is a Business-tier feature — upgrade at /precios",
    );
  }

  const params = parseQuery(req.url, plannedPurchaseQuerySchema);
  return ok(await searchPlannedPurchases(params));
});
