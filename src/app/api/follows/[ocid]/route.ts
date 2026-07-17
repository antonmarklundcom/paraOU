import { handle, ok, fail } from "@/lib/api/http";
import { auth } from "@/lib/auth";
import { isFollowing, toggleFollow } from "@/lib/api/follow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle<{ ocid: string }>(async (_req, ctx) => {
  const session = await auth();
  if (!session?.user?.id) return ok({ following: false, authenticated: false });
  const { ocid } = await ctx.params;
  return ok({ following: await isFollowing(session.user.id, ocid), authenticated: true });
});

export const POST = handle<{ ocid: string }>(async (_req, ctx) => {
  const session = await auth();
  if (!session?.user?.id)
    return fail(401, "SIGN_IN_REQUIRED", "Iniciá sesión para seguir licitaciones");
  const { ocid } = await ctx.params;
  const following = await toggleFollow(session.user.id, ocid);
  return ok({ following });
});
