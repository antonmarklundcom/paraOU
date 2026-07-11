import type { PrismaClient } from "@prisma/client";
import type { OcdsRecord } from "../lib/dncp/ocds.js";
import { logger as rootLogger, type Logger } from "../lib/log.js";
import { ingestRecords, type IngestStats } from "./ingest.js";
import { FixtureSource, LiveSource, type RecordSource } from "./source.js";
import { createDncpClientFromEnv } from "../lib/dncp/client.js";

export const INCREMENTAL_JOB = "ocds_incremental";
export const RECONCILE_JOB = "reconcile";

/** Pick the live source when DNCP is configured, otherwise fixtures. */
export function defaultSource(logger: Logger): RecordSource {
  const client = createDncpClientFromEnv(logger);
  return client ? new LiveSource(client) : new FixtureSource();
}

function maxRecordDate(records: OcdsRecord[]): Date | null {
  let max: Date | null = null;
  for (const r of records) {
    const iso = r.compiledRelease?.date;
    if (!iso) continue;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    if (!max || d > max) max = d;
  }
  return max;
}

export interface SyncResult extends IngestStats {
  job: string;
  mode: "live" | "fixtures";
  fetched: number;
  watermark: Date | null;
}

export interface SyncOptions {
  source?: RecordSource;
  logger?: Logger;
  job?: string;
  /** Override the "since" watermark (used by nightly reconciliation). */
  since?: Date | null;
}

/**
 * Incremental sync (PHASE-1 step 5): fetch records modified since the stored
 * watermark, map + upsert them by ocid, record change events, and advance the
 * watermark. Idempotent and resumable — re-running produces zero duplicates.
 */
export async function syncIncremental(
  prisma: PrismaClient,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const logger = options.logger ?? rootLogger;
  const job = options.job ?? INCREMENTAL_JOB;
  const source = options.source ?? defaultSource(logger);

  const state = await prisma.syncState.findUnique({ where: { job } });
  const since = options.since !== undefined ? options.since : (state?.watermark ?? null);

  await prisma.syncState.upsert({
    where: { job },
    create: { job, status: "running", lastRunAt: new Date() },
    update: { status: "running", lastRunAt: new Date(), lastError: null },
  });

  logger.info({ job, mode: source.mode, since }, "sync starting");

  try {
    const records = await source.recordsSince(since);
    const stats = await ingestRecords(prisma, records);
    const newWatermark = maxRecordDate(records);

    // Only advance the watermark forward, never backward.
    const watermark =
      newWatermark && (!state?.watermark || newWatermark > state.watermark)
        ? newWatermark
        : (state?.watermark ?? newWatermark);

    await prisma.syncState.update({
      where: { job },
      data: { status: "ok", watermark, cursor: null, lastRunAt: new Date(), lastError: null },
    });

    const result: SyncResult = {
      job,
      mode: source.mode,
      fetched: records.length,
      watermark,
      ...stats,
    };
    logger.info(result, "sync finished");
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.syncState.update({
      where: { job },
      data: { status: "error", lastError: message, lastRunAt: new Date() },
    });
    logger.error({ job, err: message }, "sync failed");
    throw err;
  }
}

/**
 * Nightly reconciliation: re-pull the last `days` days regardless of watermark to
 * catch late edits/backdated publications (PHASE-1 step 5).
 */
export async function reconcileRecent(
  prisma: PrismaClient,
  days = 3,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return syncIncremental(prisma, { ...options, job: RECONCILE_JOB, since });
}
