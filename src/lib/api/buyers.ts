import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { ApiError } from "./http.js";
import { cached } from "./cache.js";

const HOUR = 60 * 60 * 1000;

export async function listBuyers(query: string) {
  const pattern = `%${query}%`;
  // Accent-insensitive typeahead (CLAUDE.md rule 5).
  return prisma.$queryRaw<{ id: string; name: string; ruc: string | null; openTenders: number }[]>(
    Prisma.sql`
      SELECT b."id", b."name", b."ruc",
             (SELECT count(*)::int FROM "Tender" t WHERE t."buyerId" = b."id" AND t."status" = 'OPEN') AS "openTenders"
      FROM "Buyer" b
      WHERE unaccent(b."name") ILIKE unaccent(${pattern})
      ORDER BY b."name" ASC
      LIMIT 10
    `,
  );
}

export async function getBuyerProfile(id: string) {
  return cached(`buyer:${id}`, HOUR, async () => {
    const buyer = await prisma.buyer.findUnique({ where: { id } });
    if (!buyer) throw new ApiError(404, "NOT_FOUND", `Buyer ${id} not found`);

    const [counts] = await prisma.$queryRaw<{ open: number; total: number }[]>(Prisma.sql`
      SELECT count(*) FILTER (WHERE "status" = 'OPEN')::int AS open, count(*)::int AS total
      FROM "Tender" WHERE "buyerId" = ${id}
    `);

    const spendByCategory = await prisma.$queryRaw<
      { categoryName: string | null; tenders: number; total: string | null }[]
    >(Prisma.sql`
      SELECT "categoryName", count(*)::int AS tenders, sum("amountMax")::text AS total
      FROM "Tender" WHERE "buyerId" = ${id}
      GROUP BY "categoryName"
      ORDER BY sum("amountMax") DESC NULLS LAST
      LIMIT 10
    `);

    const awardsByYear = await prisma.$queryRaw<
      { year: number; awards: number; total: string | null }[]
    >(
      Prisma.sql`
        SELECT extract(year FROM a."date")::int AS year, count(*)::int AS awards,
               sum(a."amount")::text AS total
        FROM "Award" a JOIN "Tender" t ON a."tenderId" = t."id"
        WHERE t."buyerId" = ${id} AND a."date" IS NOT NULL
        GROUP BY year ORDER BY year DESC
      `,
    );

    return {
      id: buyer.id,
      name: buyer.name,
      ruc: buyer.ruc,
      level: buyer.level,
      openTenders: counts?.open ?? 0,
      totalTenders: counts?.total ?? 0,
      spendByCategory,
      awardsByYear,
    };
  });
}
