import { matchProfile } from "@/lib/ai/match";
import { ApiError, handle, ok } from "@/lib/api/http";
import { getMatchFeed } from "@/lib/api/matches";
import { requireProfile } from "@/lib/api/profiles";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import { aiConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The wizard's "aha moment" (docs/05 §4): judge the profile's top candidates right
 * now, capped at 5 LLM calls. This is a user-triggered action on one profile —
 * NOT a list render (CLAUDE.md rule 6 still holds for feeds); the full funnel
 * stays on the worker. Returns the refreshed feed.
 */
export const POST = handle(async (req) => {
  enforcePublicRateLimit(req);
  const profile = await requireProfile(req);
  if (!aiConfigured()) {
    throw new ApiError(503, "AI_NOT_CONFIGURED", "AI provider is not configured");
  }
  const stats = await matchProfile(profile.id, { maxJudgeCalls: 5, topN: 10 });
  return ok({ stats, feed: await getMatchFeed(profile.id) });
});
