import "dotenv/config";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/log.js";
import { runAlertEngine } from "./alerts.js";

/** One-shot alert engine run — handy for local verification and manual triggers. */
async function main() {
  const stats = await runAlertEngine(prisma, logger);
  logger.info(stats, "one-shot alert run done");
  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "alert run failed");
  process.exitCode = 1;
  void prisma.$disconnect();
});
