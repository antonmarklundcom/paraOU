import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { ApiError } from "./http.js";
import { cached } from "./cache.js";

const HOUR = 60 * 60 * 1000;

export async function getSupplierProfile(id: string) {
  return cached(`supplier:${id}`, HOUR, async () => {
    const supplier = await prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new ApiError(404, "NOT_FOUND", `Supplier ${id} not found`);

    const [totals] = await prisma.$queryRaw<{ awards: number; total: string | null }[]>(Prisma.sql`
      SELECT count(*)::int AS awards, sum("amount")::text AS total
      FROM "Award" WHERE "supplierId" = ${id}
    `);

    const categories = await prisma.$queryRaw<{ categoryName: string | null; awards: number }[]>(
      Prisma.sql`
        SELECT t."categoryName", count(*)::int AS awards
        FROM "Award" a JOIN "Tender" t ON a."tenderId" = t."id"
        WHERE a."supplierId" = ${id}
        GROUP BY t."categoryName" ORDER BY count(*) DESC NULLS LAST
        LIMIT 10
      `,
    );

    const buyers = await prisma.$queryRaw<
      { id: string; name: string; awards: number; total: string | null }[]
    >(Prisma.sql`
      SELECT b."id", b."name", count(*)::int AS awards, sum(a."amount")::text AS total
      FROM "Award" a
      JOIN "Tender" t ON a."tenderId" = t."id"
      JOIN "Buyer" b ON t."buyerId" = b."id"
      WHERE a."supplierId" = ${id}
      GROUP BY b."id", b."name" ORDER BY count(*) DESC
      LIMIT 10
    `);

    return {
      id: supplier.id,
      name: supplier.name,
      ruc: supplier.ruc,
      totalAwards: totals?.awards ?? 0,
      totalWonValue: totals?.total ?? null,
      categories,
      topBuyers: buyers,
    };
  });
}
