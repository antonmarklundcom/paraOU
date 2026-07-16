import { z } from "zod";
import { handle, ok, fail } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { suggestCategoriesFor } from "@/lib/api/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ description: z.string().trim().min(10).max(4000) });

export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const body = schema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid description", body.error.flatten());
  const suggestions = await suggestCategoriesFor(body.data.description);
  return ok({ suggestions });
});
