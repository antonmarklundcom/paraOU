import "dotenv/config";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/log.js";
import { enrichAfterSync } from "./enrich.js";

/** One-shot AI enrichment (embed + summarize + match) — handy for local
 * verification, and for backfilling embeddings/summaries for existing OPEN tenders. */
async function main() {
  await enrichAfterSync(prisma, logger);
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "enrichment failed");
  process.exitCode = 1;
  void prisma.$disconnect();
});
