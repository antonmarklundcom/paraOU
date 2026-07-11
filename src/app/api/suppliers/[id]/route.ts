import { handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { getSupplierProfile } from "@/lib/api/suppliers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ id: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const { id } = await ctx.params;
  return ok(await getSupplierProfile(id));
});
