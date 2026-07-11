import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../lib/db.js";
import { syncIncremental, INCREMENTAL_JOB } from "../sync.js";
import { ingestRecords } from "../ingest.js";
import { FixtureSource, loadFixtureRecords } from "../source.js";

/**
 * Integration test against a real Postgres (PHASE-1 acceptance: "re-running causes
 * zero duplicates", change events, generated FTS column). Requires DATABASE_URL — it
 * self-skips when no database is configured, so `npm test` still runs the pure units
 * anywhere.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

describe.skipIf(!hasDb)("ingestion (integration)", () => {
  beforeAll(async () => {
    await prisma.tenderEvent.deleteMany();
    await prisma.award.deleteMany();
    await prisma.tender.deleteMany();
    await prisma.buyer.deleteMany();
    await prisma.supplier.deleteMany();
    await prisma.syncState.deleteMany();
  });

  it("ingests the fixture tenders on the first run", async () => {
    const result = await syncIncremental(prisma, { source: new FixtureSource(), since: null });
    expect(result.created).toBe(3);
    expect(await prisma.tender.count()).toBe(3);
    expect(await prisma.buyer.count()).toBe(3);
    expect(await prisma.award.count()).toBe(1);
    expect(await prisma.supplier.count()).toBe(1);
  });

  it("is idempotent — re-running produces zero duplicate rows", async () => {
    const result = await syncIncremental(prisma, { source: new FixtureSource(), since: null });
    expect(result.created).toBe(0);
    expect(result.updated).toBe(3);
    expect(await prisma.tender.count()).toBe(3);
    expect(await prisma.award.count()).toBe(1);
    expect(await prisma.supplier.count()).toBe(1);
  });

  it("advances the sync watermark to the latest record date", async () => {
    const state = await prisma.syncState.findUnique({ where: { job: INCREMENTAL_JOB } });
    expect(state?.status).toBe("ok");
    expect(state?.watermark?.toISOString()).toBe("2024-03-14T10:00:00.000Z");
  });

  it("normalizes amounts as exact decimals and preserves raw JSON", async () => {
    const t = await prisma.tender.findUnique({ where: { ocid: "ocds-03ad3f-390111" } });
    expect(t?.amountMax?.toString()).toBe("4500000000");
    expect(t?.amountMin?.toString()).toBe("4000000000");
    expect(t?.raw).toBeTypeOf("object");
  });

  it("records change events when a later compiled release arrives", async () => {
    const updated = await loadFixtureRecords(["record-package-updated.json"]);
    const stats = await ingestRecords(prisma, updated);
    expect(stats.updated).toBe(1);

    const t = await prisma.tender.findUnique({
      where: { ocid: "ocds-03ad3f-390111" },
      include: { awards: true, events: true },
    });
    expect(t?.status).toBe("AWARDED"); // was OPEN, now complete + active award
    expect(t?.awards).toHaveLength(1);
    expect(t?.deadlineAt?.toISOString()).toBe("2024-04-12T11:00:00.000Z");

    const types = (t?.events ?? []).map((e) => e.type);
    expect(types).toContain("STATUS_CHANGE");
    expect(types).toContain("DEADLINE_CHANGE");
  });

  it("populates the Spanish accent-insensitive FTS vector", async () => {
    // "medico" (no accent) must match "Médicos" in the indexed title.
    const rows = await prisma.$queryRawUnsafe<{ ocid: string }[]>(
      `SELECT ocid FROM "Tender" WHERE "searchVector" @@ to_tsquery('spanish_unaccent', 'medico')`,
    );
    expect(rows.map((r) => r.ocid)).toContain("ocds-03ad3f-390111");
  });
});
