import "dotenv/config";
import { embedMissingTenders } from "../lib/ai/embeddings.js";
import { prisma } from "../lib/db.js";
import { aiConfigured } from "../lib/env.js";
import { logger } from "../lib/log.js";

/**
 * One-shot embedding backfill: `npm run embed:backfill [-- --limit=N]`.
 * OPEN tenders are embedded first (ORDER BY inside embedMissingTenders); historical
 * rows fill in lazily — re-run with/without --limit, or let the worker's AI pass
 * finish the tail over time (PHASE-4 deliverable 1).
 */
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

if (!aiConfigured()) {
  logger.error("AI provider not configured (GEMINI_API_KEY missing) — cannot backfill");
  process.exit(1);
}

embedMissingTenders({ limit })
  .then(async (n) => {
    logger.info({ embedded: n }, "embedding backfill finished");
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "backfill failed");
    await prisma.$disconnect();
    process.exit(1);
  });
