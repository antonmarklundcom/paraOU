import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../db.js";
import { clearCache } from "../cache.js";
import { searchTenders, getTenderDetail, type TenderQuery } from "../tenders.js";
import { getBuyerProfile, listBuyers } from "../buyers.js";
import { getSupplierProfile } from "../suppliers.js";
import { getFilterOptions, getCategoryDepartmentCombos } from "../meta.js";
import { seedApiFixtures } from "./seed.js";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

/** Convenience: run a query with schema-style defaults filled in. */
function q(overrides: Partial<TenderQuery> = {}): TenderQuery {
  return { currency: "PYG", sort: "newest", limit: 20, ...overrides } as TenderQuery;
}

async function ocids(overrides: Partial<TenderQuery> = {}): Promise<string[]> {
  const r = await searchTenders(q(overrides));
  return r.items.map((i) => i.ocid);
}

describe.skipIf(!hasDb)("tenders API (integration)", () => {
  beforeAll(async () => {
    await seedApiFixtures(prisma);
    clearCache();
  });

  // ── Filters (PHASE-2 acceptance: every docs/05 filter expressible + tested) ──
  it("full-text search is accent-insensitive (insumos medicos → insumos médicos)", async () => {
    const found = await ocids({ q: "insumos medicos", sort: "relevance" });
    expect(found).toContain("t-001");
  });

  it("FTS stems Spanish (medicamento → medicamentos)", async () => {
    expect(await ocids({ q: "medicamento" })).toContain("t-006");
  });

  it("filters by status", async () => {
    const found = await ocids({ status: ["OPEN"], limit: 50 });
    expect(found.sort()).toEqual(["t-001", "t-004", "t-006", "t-008"]);
  });

  it("filters by category code prefix", async () => {
    const found = await ocids({ category: ["4214"], limit: 50 });
    expect(found.sort()).toEqual(["t-001", "t-006"]);
  });

  it("filters by buyer, department and method", async () => {
    expect((await ocids({ buyer: "B-SALUD", limit: 50 })).sort()).toEqual(["t-001", "t-006"]);
    expect(await ocids({ department: ["Alto Paraná"], limit: 50 })).toEqual(
      expect.arrayContaining(["t-002", "t-007"]),
    );
    expect(await ocids({ method: ["Contratación Directa"], limit: 50 })).toEqual(
      expect.arrayContaining(["t-003", "t-008"]),
    );
  });

  it("filters by amount range in PYG", async () => {
    const found = await ocids({ amountMin: 5_000_000_000, limit: 50 });
    expect(found.sort()).toEqual(["t-006", "t-007"]);
  });

  it("converts a USD amount filter to PYG (default rate 7300)", async () => {
    // USD 800k * 7300 = 5.84e9 → matches t-006 (6e9) and t-007 (8e9).
    const found = await ocids({ amountMin: 800_000, currency: "USD", limit: 50 });
    expect(found.sort()).toEqual(["t-006", "t-007"]);
  });

  it("filters by deadline window", async () => {
    const found = await ocids({ deadlineWithinDays: 7, limit: 50 });
    expect(found).toEqual(["t-004"]); // +3d; excludes +10/+15/+30 and past deadlines
  });

  it("filters by published date range", async () => {
    const found = await ocids({ publishedFrom: new Date("2024-03-24"), limit: 50 });
    expect(found.sort()).toEqual(["t-006", "t-008"]);
  });

  // ── Sorts ────────────────────────────────────────────────────────────────
  it("sorts by newest", async () => {
    const found = await ocids({ sort: "newest", limit: 3 });
    expect(found).toEqual(["t-008", "t-006", "t-004"]);
  });

  it("sorts by amount desc (nulls last)", async () => {
    const found = await ocids({ sort: "amount", limit: 3 });
    expect(found).toEqual(["t-007", "t-006", "t-001"]);
  });

  it("sorts by deadline ascending", async () => {
    const r = await searchTenders(q({ sort: "deadline", limit: 50 }));
    const deadlines = r.items
      .map((i) => i.deadlineAt)
      .filter((d): d is string => d !== null)
      .map((d) => new Date(d).getTime());
    const sorted = [...deadlines].sort((a, b) => a - b);
    expect(deadlines).toEqual(sorted);
  });

  // ── Pagination ─────────────────────────────────────────────────────────────
  it("paginates with a stable cursor under concurrent inserts", async () => {
    const page1 = await searchTenders(q({ sort: "newest", limit: 3 }));
    expect(page1.items.map((i) => i.ocid)).toEqual(["t-008", "t-006", "t-004"]);
    expect(page1.nextCursor).toBeTruthy();

    // Insert a brand-new tender that sorts to the very top *after* page 1 was read.
    await prisma.tender.create({
      data: {
        ocid: "t-999",
        title: "Nuevo llamado insertado",
        status: "OPEN",
        raw: {},
        currency: "PYG",
        publishedAt: new Date("2025-01-01T00:00:00Z"),
      },
    });

    try {
      const page2 = await searchTenders(q({ sort: "newest", limit: 3, cursor: page1.nextCursor! }));
      const page2Ids = page2.items.map((i) => i.ocid);
      // The late insert must NOT appear (it belongs before page 1); no dupes/skips.
      expect(page2Ids).not.toContain("t-999");
      expect(page2Ids).not.toContain("t-008");
      // Continues in published-desc order after t-004: t-003, t-001, t-007.
      expect(page2Ids).toEqual(["t-003", "t-001", "t-007"]);
    } finally {
      await prisma.tender.delete({ where: { ocid: "t-999" } });
    }
  });

  it("reports a total estimate", async () => {
    const r = await searchTenders(q({ limit: 5 }));
    expect(r.totalEstimate).toBe(8);
    expect(r.totalCapped).toBe(false);
  });

  // ── Detail + profiles ────────────────────────────────────────────────────
  it("returns tender detail with awards, supplier and timeline", async () => {
    const d = await getTenderDetail("t-002");
    expect(d.status).toBe("AWARDED");
    expect(d.buyer?.id).toBe("B-CDE");
    expect(d.awards).toHaveLength(1);
    expect(d.awards[0]!.supplier?.name).toContain("Constructora del Este");
    expect(d.amountMax).toBe("2800000000");
  });

  it("404s an unknown tender", async () => {
    await expect(getTenderDetail("nope")).rejects.toMatchObject({ status: 404 });
  });

  it("buyer typeahead is accent-insensitive and returns open counts", async () => {
    const res = await listBuyers("educacion"); // no accent
    expect(res.map((b) => b.id)).toContain("B-MEC");
  });

  it("buyer profile aggregates open tenders and spend", async () => {
    const p = await getBuyerProfile("B-SALUD");
    expect(p.totalTenders).toBe(2);
    expect(p.openTenders).toBe(2);
    expect(p.spendByCategory.length).toBeGreaterThan(0);
  });

  it("supplier profile aggregates awards won", async () => {
    const p = await getSupplierProfile("S-ESTE");
    expect(p.totalAwards).toBe(2);
    expect(p.topBuyers.length).toBeGreaterThan(0);
  });

  it("exposes filter options with counts", async () => {
    const f = await getFilterOptions();
    expect(f.statuses.find((s) => s.value === "OPEN")?.count).toBe(4);
    expect(f.departments.find((d) => d.value === "Central")).toBeTruthy();
    expect(f.categories.length).toBeGreaterThan(0);
  });

  // ── SEO landing pages (PLAN.md Phase G) ─────────────────────────────────────
  it("category x department combos only include pairs with real tenders", async () => {
    const combos = await getCategoryDepartmentCombos();
    const altoParana = combos.filter((c) => c.department === "Alto Paraná");
    // t-002 (72141115) and t-007 (72141100) — both in Alto Paraná.
    expect(altoParana.map((c) => c.categoryCode).sort()).toEqual(["72141100", "72141115"]);
    for (const c of combos) expect(c.count).toBeGreaterThan(0);
  });
});
