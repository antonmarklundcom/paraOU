import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { deleteProfile } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete one of the account's additional company profiles (Phase F2 switcher).
 * Signed-in only — anonymous single-profile visitors have nothing to switch
 * between, so there's no anonToken equivalent here. */
export const DELETE = handle<{ id: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  const { id } = await ctx.params;
  await deleteProfile(session.user.id, id);
  return ok({ deleted: true });
});
