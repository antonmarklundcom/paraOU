import type { PrismaClient } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { logger as rootLogger, type Logger } from "../lib/log.js";
import { embedMissingTenderEmbeddings } from "../lib/ai/embeddings.js";
import { summarizeMissingTenders } from "../lib/ai/summaries.js";
import { runMatchPipelineForAllProfiles } from "../lib/ai/matching.js";
import { currentProviderName } from "../lib/ai/provider.js";

/**
 * AI enrichment (PHASE-4 step 3): embed new OPEN tenders, summarize them, then run
 * the match pipeline for every stored profile. Runs after each incremental sync as
 * its own guarded job — an AI/budget hiccup here must never block ingestion
 * correctness (CLAUDE.md rule 6).
 */
export async function enrichAfterSync(
  client: PrismaClient = prisma,
  logger: Logger = rootLogger,
): Promise<void> {
  const provider = currentProviderName();
  const embedded = await embedMissingTenderEmbeddings(client);
  const summarized = await summarizeMissingTenders(client);
  const matchStats = await runMatchPipelineForAllProfiles(client);
  logger.info({ provider, embedded, summarized, matchStats }, "AI enrichment finished");
}
