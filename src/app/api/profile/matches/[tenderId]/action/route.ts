import { z } from "zod";
import { ApiError, handle, ok } from "@/lib/api/http";
import { setMatchAction } from "@/lib/api/matches";
import { requireProfile } from "@/lib/api/profiles";
import { prisma } from "@/lib/db";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  action: z.enum(["NONE", "SAVED", "BIDDING", "DISMISSED"]),
});

/**
 * Current viewer's save/bid/dismiss state for this tender (PHASE-F4: the tender
 * detail page's "¿Por qué perdí?" award callout only renders for BIDDING viewers).
 * 404s from requireProfile mean "no profile yet" — that's just NONE, not an error.
 */
export const GET = handle<{ tenderId: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const { tenderId } = await ctx.params;
  try {
    const profile = await requireProfile(req);
    const match = await prisma.match.findUnique({
      where: { profileId_tenderId: { profileId: profile.id, tenderId } },
      select: { userAction: true },
    });
    return ok({ tenderId, action: match?.userAction ?? "NONE" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return ok({ tenderId, action: "NONE" });
    throw err;
  }
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
