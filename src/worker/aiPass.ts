import { embedMissingTenders } from "../lib/ai/embeddings.js";
import { matchAllProfiles } from "../lib/ai/match.js";
import { summarizeMissingOpenTenders } from "../lib/ai/summaries.js";
import { aiConfigured } from "../lib/env.js";
import { logger } from "../lib/log.js";

/**
 * AI post-pass, run by the worker after each sync tick (PHASE-4 deliverable 3):
 * embed new/changed tenders → summarize OPEN ones → run the match funnel for every
 * profile. Skips loudly when the provider isn't configured; the daily budget kill
 * switch is enforced inside the summary/judge loops (embeddings are ~free and keep
 * running so recall stays fresh).
 */
export async function runAiPass(): Promise<void> {
  if (!aiConfigured()) {
    logger.warn("AI provider not configured (see .env.example) — skipping AI pass");
    return;
  }
  const embedded = await embedMissingTenders();
  const summarized = await summarizeMissingOpenTenders();
  const matchRuns = await matchAllProfiles();
  logger.info(
    {
      embedded,
      summarized,
      profiles: matchRuns.length,
      judged: matchRuns.reduce((n, r) => n + r.judged, 0),
      cached: matchRuns.reduce((n, r) => n + r.cached, 0),
      budgetPaused: matchRuns.some((r) => r.budgetPaused),
    },
    "AI pass finished",
  );
}
