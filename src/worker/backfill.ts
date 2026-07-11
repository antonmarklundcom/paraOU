import "dotenv/config";
import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { createInterface } from "node:readline";
import { prisma } from "../lib/db.js";
import { logger as rootLogger, type Logger } from "../lib/log.js";
import { recordSchema, type OcdsRecord } from "../lib/dncp/ocds.js";
import { ingestRecords, emptyStats, type IngestStats } from "./ingest.js";
import { loadFixtureRecords } from "./source.js";

/**
 * Historical backfill from bulk OCDS files (PHASE-1 step 5, docs/01: use bulk
 * downloads, NOT the API, for the initial historical load — so this never touches
 * the rate limiter).
 *
 * Input is line-delimited OCDS JSON (JSONL) — one record or compiled release per
 * line — streamed so we never hold the whole file in memory. A full record-package
 * `.json` can be converted with:  jq -c '.records[]' package.json > records.jsonl
 *
 * Usage:
 *   npm run backfill -- --year=2024 --file=./data/py-2024.jsonl
 *   npm run backfill -- --url=https://.../py-2024.jsonl
 *   npm run backfill -- --year=2024            # no source + no DNCP secrets → fixtures
 */

export interface BackfillOptions {
  year?: string;
  file?: string;
  url?: string;
  batchSize?: number;
  logger?: Logger;
}

/** Coerce a JSONL line (an OCDS record OR a bare compiled release) into an OcdsRecord. */
function lineToRecord(obj: unknown): OcdsRecord | null {
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;
  if ("compiledRelease" in o || "releases" in o) {
    const parsed = recordSchema.safeParse(o);
    return parsed.success ? parsed.data : null;
  }
  // Looks like a bare release — wrap it as a single-release record.
  if ("ocid" in o) {
    const parsed = recordSchema.safeParse({ ocid: o.ocid, compiledRelease: o });
    return parsed.success ? parsed.data : null;
  }
  return null;
}

async function ingestStream(
  stream: NodeJS.ReadableStream,
  batchSize: number,
  logger: Logger,
): Promise<IngestStats> {
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const totals = emptyStats();
  let batch: OcdsRecord[] = [];
  let lineNo = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const stats = await ingestRecords(prisma, batch);
    totals.created += stats.created;
    totals.updated += stats.updated;
    totals.events += stats.events;
    totals.skipped += stats.skipped;
    logger.info({ processed: lineNo, ...totals }, "backfill progress");
    batch = [];
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lineNo++;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      totals.skipped++;
      continue;
    }
    const record = lineToRecord(obj);
    if (!record) {
      totals.skipped++;
      continue;
    }
    batch.push(record);
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  return totals;
}

export async function backfill(options: BackfillOptions): Promise<IngestStats> {
  const logger = options.logger ?? rootLogger;
  const batchSize = options.batchSize ?? 500;

  if (options.file) {
    logger.info({ file: options.file, year: options.year }, "backfill from file");
    return ingestStream(createReadStream(options.file, "utf8"), batchSize, logger);
  }

  if (options.url) {
    logger.info({ url: options.url, year: options.year }, "backfill from url");
    const res = await fetch(options.url);
    if (!res.ok || !res.body)
      throw new Error(`backfill fetch failed: ${res.status} ${res.statusText}`);
    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    return ingestStream(nodeStream, batchSize, logger);
  }

  // No source provided. Fall back to fixtures so the command is runnable offline.
  logger.warn(
    { year: options.year },
    "no --file/--url given and running without a bulk source — ingesting FIXTURES (see docs/01)",
  );
  const records = await loadFixtureRecords();
  return ingestRecords(prisma, records);
}

function parseArgs(argv: string[]): BackfillOptions {
  const opts: BackfillOptions = {};
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, value] = m;
    if (key === "year") opts.year = value;
    else if (key === "file") opts.file = value;
    else if (key === "url") opts.url = value;
    else if (key === "batch") opts.batchSize = Number(value);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const stats = await backfill(opts);
  rootLogger.info(stats, "backfill complete");
  await prisma.$disconnect();
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    rootLogger.error({ err: err instanceof Error ? err.message : String(err) }, "backfill failed");
    process.exitCode = 1;
    void prisma.$disconnect();
  });
}
