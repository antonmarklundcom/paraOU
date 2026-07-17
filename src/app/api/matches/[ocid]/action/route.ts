import { handle, ok, fail } from "@/lib/api/http";
import { getCurrentProfile } from "@/lib/identity";
import { matchActionSchema, setMatchAction } from "@/lib/api/matches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle<{ ocid: string }>(async (req, ctx) => {
  const { profile } = await getCurrentProfile();
  if (!profile) return fail(404, "NO_PROFILE", "No profile for this browser yet");

  const body = matchActionSchema.safeParse(await req.json());
  if (!body.success) return fail(400, "VALIDATION", "Invalid action", body.error.flatten());

  const { ocid } = await ctx.params;
  const match = await setMatchAction(profile.id, ocid, body.data.action);
  return ok(match);
});
