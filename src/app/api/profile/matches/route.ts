import { handle, ok } from "@/lib/api/http";
import { getMatchFeed } from "@/lib/api/matches";
import { requireProfile } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Grouped match feed for /panel: Nuevos / Cierran pronto / Guardados. */
export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const profile = await requireProfile(req);
  return ok(await getMatchFeed(profile.id));
});
