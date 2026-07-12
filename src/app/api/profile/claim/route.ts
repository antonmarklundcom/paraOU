import { z } from "zod";
import { auth } from "@/lib/auth";
import { claimAnonymousProfile, publicProfile } from "@/lib/api/profiles";
import { ApiError, handle, ok } from "@/lib/api/http";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ anonToken: z.string().min(1) });

/**
 * First-login migration (PHASE-5 #1). The client calls this once, right after
 * sign-in, passing whatever anonToken it has in localStorage (if any).
 */
export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  const { anonToken } = bodySchema.parse(await req.json());
  const profile = await claimAnonymousProfile(session.user.id, anonToken);
  return ok({ claimed: Boolean(profile), profile: profile ? publicProfile(profile) : null });
});
