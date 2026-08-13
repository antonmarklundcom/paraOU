import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/log.js";
import { dncpConfigured } from "../lib/env.js";
import { reconcileRecent, syncIncremental, syncPlanningIncremental } from "./sync.js";
import { runAiPass } from "./aiPass.js";
import { runAlertEngine } from "../lib/alerts/engine.js";

/**
 * Ingestion worker entry (docs/02, PHASE-1 step 5): a single long-running process
 * driven by node-cron. Web latency is never affected because sync runs here, not in
 * request handlers (CLAUDE.md rule 3).
 *
 *  - incremental sync every 30 min (tenders + PAC planned purchases, F3) (+ AI
 *    pass, + INSTANT-frequency alerts)
 *  - nightly reconciliation of the last 3 days at 03:15 America/Asuncion
 *  - daily digest (PHASE-5 #3) at 08:00 America/Asuncion for alertFrequency=DAILY
 *  - weekly digest Mondays 08:00 for alertFrequency=WEEKLY
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

async function start() {
  logger.info(
    { mode: dncpConfigured() ? "live" : "fixtures", tz: TZ },
    "ParaOU ingestion worker starting",
  );

  // Sync then AI post-pass (Phase 4) then INSTANT alerts (Phase 5): embeddings →
  // summaries → match funnel → digest for users who chose instant alerts. The PAC
  // (`planificaciones`) sync (F3) rides the same cadence, through the same
  // DncpClient — a separate SyncState watermark, but never a second client.
  const syncThenAi = async () => {
    await syncIncremental(prisma);
    await syncPlanningIncremental(prisma);
    await runAiPass();
    await runAlertEngine(["INSTANT"]);
  };

  // Run one incremental sync immediately on boot so a fresh deploy has data.
  await guarded("startup-sync", syncThenAi);

  // Every 30 minutes.
  cron.schedule("*/30 * * * *", () => void guarded("incremental", syncThenAi), {
    timezone: TZ,
  });

  // Nightly reconciliation at 03:15.
  cron.schedule(
    "15 3 * * *",
    () =>
      void guarded("reconcile", async () => {
        await reconcileRecent(prisma, 3);
        await runAiPass();
      }),
    { timezone: TZ },
  );

  // Daily digest at 08:00 — after the reconciliation pass has settled the data.
  cron.schedule("0 8 * * *", () => void guarded("daily-digest", () => runAlertEngine(["DAILY"])), {
    timezone: TZ,
  });

  // Weekly digest Mondays at 08:00.
  cron.schedule(
    "0 8 * * 1",
    () => void guarded("weekly-digest", () => runAlertEngine(["WEEKLY"])),
    { timezone: TZ },
  );

  logger.info(
    "cron schedules registered (incremental */30 [+instant alerts], reconcile 03:15, daily digest 08:00, weekly digest Mon 08:00)",
  );
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
