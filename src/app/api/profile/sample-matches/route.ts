import { handle, ok, fail } from "@/lib/api/http";
import { getCurrentProfile } from "@/lib/identity";
import { sampleMatches } from "@/lib/api/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const { profile } = await getCurrentProfile();
  if (!profile) return fail(404, "NO_PROFILE", "No profile for this browser yet");
  const matches = await sampleMatches(profile.id);
  return ok({ matches });
});
