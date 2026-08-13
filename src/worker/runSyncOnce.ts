import "dotenv/config";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/log.js";
import { syncIncremental, syncPlanningIncremental } from "./sync.js";

/** One-shot incremental sync — handy for local verification and manual runs. */
async function main() {
  const result = await syncIncremental(prisma);
  logger.info(result, "one-shot sync done");
  const planningResult = await syncPlanningIncremental(prisma);
  logger.info(planningResult, "one-shot planning sync done");
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "one-shot sync failed");
  process.exitCode = 1;
  void prisma.$disconnect();
});
