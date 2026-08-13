import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../db.js";
import { clearCache } from "../cache.js";
import { getObservatorioStats } from "../observatorio.js";
import { seedApiFixtures } from "./seed.js";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

describe.skipIf(!hasDb)("observatorio stats (integration)", () => {
  beforeAll(async () => {
    await seedApiFixtures(prisma);

    // seedApiFixtures uses fixed 2024 publishedAt dates (deterministic for the
    // filter/sort tests elsewhere) so "this week"/"this month" would always read
    // zero here — add a couple of recently-published rows just for this file.
    const day = 24 * 60 * 60 * 1000;
    await prisma.tender.createMany({
      data: [
        {
          ocid: "obs-recent-1",
          title: "Compra reciente 1",
          status: "OPEN",
          buyerId: "B-SALUD",
          buyerName: "Ministerio de Salud Pública",
          department: "Central",
          categoryCode: "42142523",
          categoryName: "Jeringas hipodérmicas",
          currency: "PYG",
          amountMax: "1000000000",
          amountMin: "1000000000",
          publishedAt: new Date(Date.now() - 2 * day),
          raw: {},
        },
        {
          ocid: "obs-recent-2",
          title: "Compra reciente 2",
          status: "OPEN",
          buyerId: "B-CDE",
          buyerName: "Municipalidad de Ciudad del Este",
          department: "Alto Paraná",
          categoryCode: "72141115",
          categoryName: "Servicios de pavimentación",
          currency: "PYG",
          amountMax: "500000000",
          amountMin: "500000000",
          publishedAt: new Date(Date.now() - 20 * day),
          raw: {},
        },
      ],
    });

    clearCache();
  });

  it("counts tenders published this week and this month", async () => {
    const stats = await getObservatorioStats();
    expect(stats.thisWeek.count).toBe(1); // only obs-recent-1 (2 days ago)
    expect(stats.thisMonth.count).toBe(2); // both recent rows (2d, 20d)
    expect(Number(stats.thisWeek.totalValue)).toBe(1_000_000_000);
  });

  it("reports the total tender count", async () => {
    const stats = await getObservatorioStats();
    // 8 seeded fixtures + 2 recent rows added above.
    expect(stats.totalTenders).toBe(10);
  });

  it("ranks top categories by open value, richest first", async () => {
    const stats = await getObservatorioStats();
    const codes = stats.topCategories.map((c) => c.categoryCode);
    // t-006 (6B) > obs-recent-1 + t-001 (5.5B) > t-004 (120M) > t-008 (null, last)
    expect(codes[0]).toBe("42142500");
    expect(codes).toContain("44121700");
    expect(codes.indexOf("44121700")).toBe(codes.length - 1);
  });

  it("ranks top buyers by total awarded amount", async () => {
    const stats = await getObservatorioStats();
    expect(stats.topBuyers[0]?.id).toBe("B-CDE");
    expect(stats.topBuyers[0]?.awards).toBe(2);
    expect(Number(stats.topBuyers[0]?.totalAwarded)).toBe(10_650_000_000);
  });

  it("lists open tenders closing within 7 days, soonest first", async () => {
    const stats = await getObservatorioStats();
    expect(stats.closingSoon.map((t) => t.ocid)).toEqual(["t-004"]);
  });

  it("caches results (a second call doesn't recompute against a changed DB)", async () => {
    const first = await getObservatorioStats();
    await prisma.tender.updateMany({ where: { ocid: "t-004" }, data: { status: "CLOSED" } });
    const second = await getObservatorioStats();
    expect(second.closingSoon).toEqual(first.closingSoon);
    // restore for other tests in this file/run
    await prisma.tender.updateMany({ where: { ocid: "t-004" }, data: { status: "OPEN" } });
    clearCache();
  });
});
