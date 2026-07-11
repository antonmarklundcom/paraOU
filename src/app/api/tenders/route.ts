import { handle, ok, parseQuery } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { searchTenders, tenderQuerySchema } from "@/lib/api/tenders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const params = parseQuery(req.url, tenderQuerySchema);
  return ok(await searchTenders(params));
});
