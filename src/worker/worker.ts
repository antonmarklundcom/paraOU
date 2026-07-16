import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/log.js";
import { dncpConfigured, aiConfigured } from "../lib/env.js";
import { reconcileRecent, syncIncremental } from "./sync.js";
import { enrichAfterSync } from "./enrich.js";

/**
 * Ingestion worker entry (docs/02, PHASE-1 step 5): a single long-running process
 * driven by node-cron. Web latency is never affected because sync runs here, not in
 * request handlers (CLAUDE.md rule 3).
 *
 *  - incremental sync every 30 min
 *  - nightly reconciliation of the last 3 days at 03:15 America/Asuncion
 *
 * Jobs never overlap (a simple in-process lock) and errors are logged, not thrown,
 * so one bad run doesn't kill the worker.
 */

const TZ = "America/Asuncion";
let running = false;

async function guarded(name: string, fn: () => Promise<unknown>) {
  if (running) {
    logger.warn({ job: name }, "previous job still running, skipping this tick");
    return;
  }
  running = true;
  try {
    await fn();
  } catch (err) {
    logger.error(
      { job: name, err: err instanceof Error ? err.message : String(err) },
      "job errored",
    );
  } finally {
    running = false;
  }
}

/** Sync, then enrich (embed/summarize/match) — enrich failures are isolated so an
 * AI hiccup never masks or blocks ingestion (CLAUDE.md rule 6). */
async function syncAndEnrich() {
  await syncIncremental(prisma);
  try {
    await enrichAfterSync(prisma);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "AI enrichment failed");
  }
}

async function start() {
  logger.info(
    {
      mode: dncpConfigured() ? "live" : "fixtures",
      ai: aiConfigured() ? "gemini" : "mock",
      tz: TZ,
    },
    "ParaOU ingestion worker starting",
  );

  // Run one incremental sync immediately on boot so a fresh deploy has data.
  await guarded("startup-sync", syncAndEnrich);

  // Every 30 minutes.
  cron.schedule("*/30 * * * *", () => void guarded("incremental", syncAndEnrich), {
    timezone: TZ,
  });

  // Nightly reconciliation at 03:15.
  cron.schedule(
    "15 3 * * *",
    () =>
      void guarded("reconcile", async () => {
        await reconcileRecent(prisma, 3);
        try {
          await enrichAfterSync(prisma);
        } catch (err) {
          logger.error(
            { err: err instanceof Error ? err.message : String(err) },
            "AI enrichment failed",
          );
        }
      }),
    { timezone: TZ },
  );

  logger.info("cron schedules registered (incremental */30, reconcile 03:15)");
}

async function shutdown(signal: string) {
  logger.info({ signal }, "worker shutting down");
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

start().catch((err) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "worker failed to start");
  process.exitCode = 1;
});
