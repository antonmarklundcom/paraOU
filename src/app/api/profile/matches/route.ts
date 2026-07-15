import type { Plan } from "@prisma/client";
import { auth } from "@/lib/auth";
import { handle, ok } from "@/lib/api/http";
import { getMatchFeed } from "@/lib/api/matches";
import { requireProfile } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Grouped match feed for /panel: Nuevos / Cierran pronto / Guardados. Full AI
 * reasoning is capped per plan (PHASE-6 #1) — anonymous visitors read as FREE. */
export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const [profile, session] = await Promise.all([requireProfile(req), auth()]);
  return ok(await getMatchFeed(profile.id, (session?.user?.plan as Plan) ?? "FREE"));
});
