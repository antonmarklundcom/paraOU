import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { cached } from "./cache.js";

const HOUR = 60 * 60 * 1000;

export interface ObservatorioWindow {
  count: number;
  totalValue: string | null;
}

export interface ObservatorioCategory {
  categoryCode: string;
  categoryName: string | null;
  count: number;
  totalValue: string | null;
}

export interface ObservatorioBuyer {
  id: string;
  name: string;
  awards: number;
  totalAwarded: string | null;
}

export interface ObservatorioClosingSoon {
  ocid: string;
  title: string;
  buyerName: string | null;
  department: string | null;
  amountMax: string | null;
  deadlineAt: string | null;
}

export interface ObservatorioStats {
  totalTenders: number;
  thisWeek: ObservatorioWindow;
  thisMonth: ObservatorioWindow;
  topCategories: ObservatorioCategory[];
  topBuyers: ObservatorioBuyer[];
  closingSoon: ObservatorioClosingSoon[];
  generatedAt: string;
}

/**
 * Aggregate stats for the free weekly "observatorio" page (PLAN.md Phase G, docs/07
 * #12 — "a free 'observatorio' page earns press links and SEO authority"). Every
 * number here is public DNCP data — no login, no plan gate (plan.ts rule: data is
 * never gated). Cached 1h like the other public aggregate endpoints.
 */
export async function getObservatorioStats(): Promise<ObservatorioStats> {
  return cached("observatorio:stats", HOUR, async () => {
    const [totalRow, weekRow, monthRow, topCategories, topBuyers, closingSoon] =
      await Promise.all([
        prisma.$queryRaw<{ c: number }[]>(Prisma.sql`SELECT count(*)::int AS c FROM "Tender"`),
        prisma.$queryRaw<{ count: number; total: string | null }[]>(Prisma.sql`
          SELECT count(*)::int AS count, sum("amountMax")::text AS total
          FROM "Tender" WHERE "publishedAt" >= now() - interval '7 days'
        `),
        prisma.$queryRaw<{ count: number; total: string | null }[]>(Prisma.sql`
          SELECT count(*)::int AS count, sum("amountMax")::text AS total
          FROM "Tender" WHERE "publishedAt" >= now() - interval '30 days'
        `),
        prisma.$queryRaw<
          { categoryCode: string; categoryName: string | null; count: number; total: string | null }[]
        >(Prisma.sql`
          SELECT "categoryCode", max("categoryName") AS "categoryName", count(*)::int AS count,
                 sum("amountMax")::text AS total
          FROM "Tender"
          WHERE "status" = 'OPEN' AND "categoryCode" IS NOT NULL
          GROUP BY "categoryCode"
          ORDER BY sum("amountMax") DESC NULLS LAST
          LIMIT 8
        `),
        prisma.$queryRaw<{ id: string; name: string; awards: number; total: string | null }[]>(
          Prisma.sql`
            SELECT b."id", b."name", count(a.*)::int AS awards, sum(a."amount")::text AS total
            FROM "Award" a
            JOIN "Tender" t ON a."tenderId" = t."id"
            JOIN "Buyer" b ON t."buyerId" = b."id"
            WHERE a."amount" IS NOT NULL
            GROUP BY b."id", b."name"
            ORDER BY sum(a."amount") DESC NULLS LAST
            LIMIT 8
          `,
        ),
        prisma.$queryRaw<
          {
            ocid: string;
            title: string;
            buyerName: string | null;
            department: string | null;
            amountMax: string | null;
            deadlineAt: Date | null;
          }[]
        >(Prisma.sql`
          SELECT "ocid", "title", "buyerName", "department", "amountMax"::text AS "amountMax",
                 "deadlineAt"
          FROM "Tender"
          WHERE "status" = 'OPEN' AND "deadlineAt" >= now()
            AND "deadlineAt" <= now() + interval '7 days'
          ORDER BY "deadlineAt" ASC
          LIMIT 10
        `),
      ]);

    return {
      totalTenders: totalRow[0]?.c ?? 0,
      thisWeek: { count: weekRow[0]?.count ?? 0, totalValue: weekRow[0]?.total ?? null },
      thisMonth: { count: monthRow[0]?.count ?? 0, totalValue: monthRow[0]?.total ?? null },
      topCategories: topCategories.map((c) => ({
        categoryCode: c.categoryCode,
        categoryName: c.categoryName,
        count: c.count,
        totalValue: c.total,
      })),
      topBuyers: topBuyers.map((b) => ({
        id: b.id,
        name: b.name,
        awards: b.awards,
        totalAwarded: b.total,
      })),
      closingSoon: closingSoon.map((t) => ({
        ocid: t.ocid,
        title: t.title,
        buyerName: t.buyerName,
        department: t.department,
        amountMax: t.amountMax,
        deadlineAt: t.deadlineAt ? new Date(t.deadlineAt).toISOString() : null,
      })),
      generatedAt: new Date().toISOString(),
    };
  });
}
