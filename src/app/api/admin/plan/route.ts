import { handle, ok } from "@/lib/api/http";
import { overridePlan, planOverrideSchema, requireAdmin } from "@/lib/api/admin";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Manual plan override — admin only (PHASE-6 #2/#5). */
export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  await requireAdmin();
  const body = planOverrideSchema.parse(await req.json());
  const user = await overridePlan(body);
  return ok({ id: user.id, plan: user.plan, manualBilling: user.manualBilling });
});
