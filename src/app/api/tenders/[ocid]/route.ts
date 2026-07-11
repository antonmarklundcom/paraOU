import { handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { getTenderDetail } from "@/lib/api/tenders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ ocid: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const { ocid } = await ctx.params;
  return ok(await getTenderDetail(ocid));
});
