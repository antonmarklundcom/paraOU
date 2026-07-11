import { handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { getFilterOptions } from "@/lib/api/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  return ok(await getFilterOptions());
});
