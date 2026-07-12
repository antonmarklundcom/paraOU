import { z } from "zod";
import { handle, ok } from "@/lib/api/http";
import { setMatchAction } from "@/lib/api/matches";
import { requireProfile } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["NONE", "SAVED", "BIDDING", "DISMISSED"]),
});

/** Persist save/bid/dismiss to Match.userAction — the feedback-loop gold (docs/04). */
export const POST = handle<{ tenderId: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const profile = await requireProfile(req);
  const { tenderId } = await ctx.params;
  const { action } = bodySchema.parse(await req.json());
  await setMatchAction(profile.id, tenderId, action);
  return ok({ tenderId, action });
});
