import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dncpConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health / ingestion-status endpoint (PHASE-1 step 6). Reports last sync age and row
 * counts so the worker's SyncState doubles as a health record. Returns HTTP 503 if a
 * sync job is in an error state or has never run.
 */
export async function GET() {
  try {
    const [tenders, buyers, awards, syncStates] = await Promise.all([
      prisma.tender.count(),
      prisma.buyer.count(),
      prisma.award.count(),
      prisma.syncState.findMany(),
    ]);

    const now = Date.now();
    const jobs = syncStates.map((s) => ({
      job: s.job,
      status: s.status,
      lastRunAt: s.lastRunAt,
      watermark: s.watermark,
      ageSeconds: s.lastRunAt ? Math.round((now - s.lastRunAt.getTime()) / 1000) : null,
      lastError: s.lastError,
    }));

    const healthy = jobs.length > 0 && jobs.every((j) => j.status !== "error");

    return NextResponse.json(
      {
        status: healthy ? "ok" : "degraded",
        mode: dncpConfigured() ? "live" : "fixtures",
        counts: { tenders, buyers, awards },
        jobs,
        time: new Date().toISOString(),
      },
      { status: healthy ? 200 : 503 },
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
