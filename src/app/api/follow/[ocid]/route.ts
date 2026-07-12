import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { isFollowing, toggleFollow } from "@/lib/api/follow";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ ocid: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user?.id) return ok({ following: false });
  const { ocid } = await ctx.params;
  return ok({ following: await isFollowing(session.user.id, ocid) });
});

export const POST = handle<{ ocid: string }>(async (req, ctx) => {
  enforcePublicRateLimit(req);
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  const { ocid } = await ctx.params;
  return ok({ following: await toggleFollow(session.user.id, ocid) });
});
