import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { cached } from "./cache.js";

const HOUR = 60 * 60 * 1000;

/**
 * Filter option lists with counts for the overview filter rail (docs/05 §1).
 * Cached 1h — these shift slowly and are hit on every page load.
 */
export async function getFilterOptions() {
  return cached("meta:filters", HOUR, async () => {
    const [statuses, departments, methods, categories] = await Promise.all([
      prisma.$queryRaw<{ value: string; count: number }[]>(Prisma.sql`
        SELECT "status"::text AS value, count(*)::int AS count
        FROM "Tender" GROUP BY "status" ORDER BY count DESC
      `),
      prisma.$queryRaw<{ value: string; count: number }[]>(Prisma.sql`
        SELECT "department" AS value, count(*)::int AS count
        FROM "Tender" WHERE "department" IS NOT NULL
        GROUP BY "department" ORDER BY count DESC LIMIT 50
      `),
      prisma.$queryRaw<{ value: string; count: number }[]>(Prisma.sql`
        SELECT "procurementMethod" AS value, count(*)::int AS count
        FROM "Tender" WHERE "procurementMethod" IS NOT NULL
        GROUP BY "procurementMethod" ORDER BY count DESC LIMIT 50
      `),
      prisma.$queryRaw<{ code: string; name: string | null; count: number }[]>(Prisma.sql`
        SELECT "categoryCode" AS code, max("categoryName") AS name, count(*)::int AS count
        FROM "Tender" WHERE "categoryCode" IS NOT NULL
        GROUP BY "categoryCode" ORDER BY count DESC LIMIT 100
      `),
    ]);
    return { statuses, departments, methods, categories };
  });
}

/**
 * Category × department pairs with real tenders, for the SEO combo landing pages
 * (`/licitaciones/categoria/[slug]/[deptSlug]`, PLAN.md Phase G). Capped and cached
 * like `getFilterOptions` — only pairs that actually have data get a page, so the
 * combo pages are never thin/empty content.
 */
export async function getCategoryDepartmentCombos(limit = 300) {
  return cached(`meta:combos:${limit}`, HOUR, async () => {
    return prisma.$queryRaw<
      { categoryCode: string; categoryName: string | null; department: string; count: number }[]
    >(Prisma.sql`
      SELECT "categoryCode", max("categoryName") AS "categoryName", "department",
             count(*)::int AS count
      FROM "Tender"
      WHERE "categoryCode" IS NOT NULL AND "department" IS NOT NULL
      GROUP BY "categoryCode", "department"
      ORDER BY count DESC
      LIMIT ${limit}
    `);
  });
}
