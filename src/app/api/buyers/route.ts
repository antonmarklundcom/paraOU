import { z } from "zod";
import { handle, ok, parseQuery } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { listBuyers } from "@/lib/api/buyers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ query: z.string().trim().min(1).max(120) });

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const { query } = parseQuery(req.url, schema);
  return ok(await listBuyers(query));
});
