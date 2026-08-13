import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../db.js";
import { searchPlannedPurchases, plannedPurchaseQuerySchema } from "../plannedPurchases.js";

/** F3 acceptance: the Business-tier planned-purchases feed lists/filters/paginates
 * correctly once ingested. Requires DATABASE_URL — self-skips otherwise. */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

describe.skipIf(!hasDb)("searchPlannedPurchases (integration)", () => {
  beforeAll(async () => {
    await prisma.plannedPurchase.deleteMany();
    await prisma.plannedPurchase.createMany({
      data: [
        {
          externalId: "PP-1",
          title: "Ambulancias",
          year: 2026,
          categoryCode: "25101507",
          department: "Central",
          currency: "PYG",
          estimatedAmount: "12000000000",
          publishedAt: new Date("2026-01-10T09:00:00Z"),
          estimatedDate: new Date("2026-10-01T00:00:00Z"),
          raw: {},
        },
        {
          externalId: "PP-2",
          title: "Pavimentación",
          year: 2026,
          categoryCode: "72141115",
          department: "Alto Paraná",
          currency: "PYG",
          estimatedAmount: "3200000000",
          publishedAt: new Date("2026-01-08T09:00:00Z"),
          estimatedDate: new Date("2026-04-01T00:00:00Z"),
          raw: {},
        },
        {
          externalId: "PP-3",
          title: "Kits escolares",
          year: 2025,
          categoryCode: "44121700",
          department: "Itapúa",
          currency: "PYG",
          estimatedAmount: "950000000",
          publishedAt: new Date("2026-01-05T09:00:00Z"),
          estimatedDate: new Date("2026-02-01T00:00:00Z"),
          raw: {},
        },
      ],
    });
  });

  function q(overrides: Record<string, unknown> = {}) {
    return plannedPurchaseQuerySchema.parse(overrides);
  }

  it("lists all entries newest-published first by default", async () => {
    const r = await searchPlannedPurchases(q());
    expect(r.items.map((i) => i.externalId)).toEqual(["PP-1", "PP-2", "PP-3"]);
    expect(r.total).toBe(3);
  });

  it("filters by category", async () => {
    const r = await searchPlannedPurchases(q({ category: ["25101507"] }));
    expect(r.items.map((i) => i.externalId)).toEqual(["PP-1"]);
  });

  it("filters by department", async () => {
    const r = await searchPlannedPurchases(q({ department: ["Alto Paraná"] }));
    expect(r.items.map((i) => i.externalId)).toEqual(["PP-2"]);
  });

  it("filters by year", async () => {
    const r = await searchPlannedPurchases(q({ year: 2025 }));
    expect(r.items.map((i) => i.externalId)).toEqual(["PP-3"]);
  });

  it("sorts by estimatedDate ascending when requested", async () => {
    const r = await searchPlannedPurchases(q({ sort: "estimatedDate" }));
    expect(r.items.map((i) => i.externalId)).toEqual(["PP-3", "PP-2", "PP-1"]);
  });

  it("paginates with page/limit", async () => {
    const r = await searchPlannedPurchases(q({ limit: 1, page: 2 }));
    expect(r.items.map((i) => i.externalId)).toEqual(["PP-2"]);
    expect(r.total).toBe(3);
  });
});
