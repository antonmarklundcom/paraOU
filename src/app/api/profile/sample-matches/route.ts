import { handle, ok, fail } from "@/lib/api/http";
import { readAnonId } from "@/lib/anon";
import { getProfileByAnonId, sampleMatches } from "@/lib/api/profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const anonId = await readAnonId();
  if (!anonId) return fail(404, "NO_PROFILE", "No profile for this browser yet");
  const profile = await getProfileByAnonId(anonId);
  if (!profile) return fail(404, "NO_PROFILE", "No profile for this browser yet");
  const matches = await sampleMatches(profile.id);
  return ok({ matches });
});
