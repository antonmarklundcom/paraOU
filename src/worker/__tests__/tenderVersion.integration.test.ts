import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db.js";
import { upsertTender } from "../ingest.js";
import type { MappedTender } from "../../lib/dncp/map.js";

/**
 * Phase 4 ingest rules: match-relevant changes bump Tender.version (the
 * re-judge cache key); text changes also invalidate embedding + aiSummary.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

function mapped(overrides: Partial<MappedTender> = {}): MappedTender {
  return {
    ocid: "v-test-1",
    dncpId: null,
    title: "Original title",
    description: "Original description",
    status: "OPEN",
    buyer: null,
    buyerName: null,
    categoryCode: null,
    categoryName: null,
    procurementMethod: null,
    amountMin: null,
    amountMax: "100",
    currency: "PYG",
    department: null,
    publishedAt: null,
    deadlineAt: null,
    inquiryDeadlineAt: null,
    documentsUrl: null,
    sourceUrl: null,
    awards: [],
    raw: {},
    ...overrides,
  } as MappedTender;
}

describe.skipIf(!hasDb)("Tender.version on ingest (integration)", () => {
  beforeAll(async () => {
    await prisma.match.deleteMany();
    await prisma.tenderEvent.deleteMany();
    await prisma.award.deleteMany();
    await prisma.tender.deleteMany();
  });

  it("re-ingesting identical content does NOT bump version", async () => {
    await upsertTender(prisma, mapped());
    await prisma.tender.update({
      where: { ocid: "v-test-1" },
      data: { aiSummary: "resumen" },
    });
    await upsertTender(prisma, mapped());
    const t = await prisma.tender.findUniqueOrThrow({ where: { ocid: "v-test-1" } });
    expect(t.version).toBe(1);
    expect(t.aiSummary).toBe("resumen"); // untouched
  });

  it("text change bumps version and clears embedding + aiSummary", async () => {
    await prisma.$executeRaw`
      UPDATE "Tender" SET embedding = (SELECT ('[' || string_agg('0', ',') || ']')::vector
      FROM generate_series(1, 768)) WHERE ocid = 'v-test-1'
    `;
    await upsertTender(prisma, mapped({ title: "Changed title" }));
    const t = await prisma.tender.findUniqueOrThrow({ where: { ocid: "v-test-1" } });
    expect(t.version).toBe(2);
    expect(t.aiSummary).toBeNull();
    const rows = await prisma.$queryRaw<{ hasEmbedding: boolean }[]>`
      SELECT (embedding IS NOT NULL) AS "hasEmbedding" FROM "Tender" WHERE ocid = 'v-test-1'
    `;
    expect(rows[0]?.hasEmbedding).toBe(false);
  });

  it("status change bumps version but keeps embedding/summary", async () => {
    await prisma.tender.update({
      where: { ocid: "v-test-1" },
      data: { aiSummary: "resumen 2" },
    });
    await upsertTender(prisma, mapped({ title: "Changed title", status: "CLOSED" }));
    const t = await prisma.tender.findUniqueOrThrow({ where: { ocid: "v-test-1" } });
    expect(t.version).toBe(3);
    expect(t.aiSummary).toBe("resumen 2");
  });
});
