import { handle, ok } from "@/lib/api/http";
import { requireAdmin, getAiUsageSummary } from "@/lib/api/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  requireAdmin(req);
  return ok(await getAiUsageSummary());
});
