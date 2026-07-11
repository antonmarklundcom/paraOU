import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { cached } from "./cache.js";

/** Landing-page counters (docs/05 §4): open tenders + total value in play. Cached
 * 10 min so the homepage stays snappy. */
export async function getHomeStats() {
  return cached("home:stats", 10 * 60 * 1000, async () => {
    const [row] = await prisma.$queryRaw<
      { openCount: number; openValue: string | null }[]
    >(Prisma.sql`
      SELECT count(*)::int AS "openCount", sum("amountMax")::text AS "openValue"
      FROM "Tender" WHERE "status" = 'OPEN'
    `);
    return { openCount: row?.openCount ?? 0, openValue: row?.openValue ?? null };
  });
}
