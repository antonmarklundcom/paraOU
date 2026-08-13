import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../lib/db.js";
import { syncPlanningIncremental, PLANNING_JOB } from "../sync.js";
import { FixturePlanningSource, loadFixturePlanificaciones } from "../planningSource.js";
import { ingestPlanificaciones } from "../planningIngest.js";

/**
 * Integration test against a real Postgres (mirrors worker/__tests__/ingest.
 * integration.test.ts for tenders — F3 acceptance: "re-running causes zero
 * duplicates"). Requires DATABASE_URL — self-skips otherwise.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

describe.skipIf(!hasDb)("PAC planning ingestion (integration)", () => {
  beforeAll(async () => {
    await prisma.plannedPurchase.deleteMany();
    await prisma.syncState.deleteMany({ where: { job: PLANNING_JOB } });
  });

  it("ingests the fixture PAC entries on the first run", async () => {
    const result = await syncPlanningIncremental(prisma, {
      source: new FixturePlanningSource(),
      since: null,
    });
    expect(result.created).toBe(3);
    expect(await prisma.plannedPurchase.count()).toBe(3);
    // Each PAC entry's buyer upserts into the shared Buyer table (same pattern as
    // tenders) — no separate "PacBuyer" model.
    expect(await prisma.buyer.count()).toBe(3);
  });

  it("is idempotent — re-running produces zero duplicate rows", async () => {
    const result = await syncPlanningIncremental(prisma, {
      source: new FixturePlanningSource(),
      since: null,
    });
    expect(result.created).toBe(0);
    expect(result.updated).toBe(3);
    expect(await prisma.plannedPurchase.count()).toBe(3);
  });

  it("advances the sync watermark to the latest publishedDate", async () => {
    const state = await prisma.syncState.findUnique({ where: { job: PLANNING_JOB } });
    expect(state?.status).toBe("ok");
    expect(state?.watermark?.toISOString()).toBe("2026-01-10T09:00:00.000Z");
  });

  it("normalizes the estimated amount as an exact decimal and preserves raw JSON", async () => {
    const p = await prisma.plannedPurchase.findUnique({ where: { externalId: "PAC-2026-000451" } });
    expect(p?.estimatedAmount?.toString()).toBe("12000000000");
    expect(p?.raw).toBeTypeOf("object");
    expect(p?.buyerId).toBe("PY-RUC-80016909");
  });

  it("re-ingesting after a status change updates the row in place (no duplicate)", async () => {
    const items = await loadFixturePlanificaciones();
    const changed = items.map((item) =>
      item.id === "PAC-2026-000453" ? { ...item, estado: "CANCELADO" } : item,
    );
    const stats = await ingestPlanificaciones(prisma, changed);
    expect(stats.updated).toBe(3);
    expect(await prisma.plannedPurchase.count()).toBe(3);
    const p = await prisma.plannedPurchase.findUnique({ where: { externalId: "PAC-2026-000453" } });
    expect(p?.status).toBe("CANCELADO");
  });
});
