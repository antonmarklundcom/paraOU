import { handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { getBuyerProfile } from "@/lib/api/buyers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const { id } = await ctx.params;
  return ok(await getBuyerProfile(id));
});
