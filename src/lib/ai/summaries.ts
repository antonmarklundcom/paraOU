import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";
import { logger } from "../log.js";
import { summarizeTender } from "./provider.js";

/** One-paragraph "Resumen en simple" for OPEN tenders (docs/04, generated once at
 * ingest, cached in Tender.aiSummary). Never called synchronously from a request
 * path (CLAUDE.md rule 6). */
export async function summarizeAndStoreTender(
  tenderId: string,
  client: PrismaClient = prisma,
): Promise<boolean> {
  const tender = await client.tender.findUniqueOrThrow({
    where: { id: tenderId },
    select: {
      title: true,
      description: true,
      buyerName: true,
      categoryName: true,
      procurementMethod: true,
      amountMax: true,
      currency: true,
      department: true,
      deadlineAt: true,
    },
  });
  const { result } = await summarizeTender(
    {
      title: tender.title,
      description: tender.description,
      buyerName: tender.buyerName,
      categoryName: tender.categoryName,
      procurementMethod: tender.procurementMethod,
      amountMax: tender.amountMax?.toString() ?? null,
      currency: tender.currency,
      department: tender.department,
      deadlineAt: tender.deadlineAt ? tender.deadlineAt.toISOString() : null,
    },
    client,
  );
  if (!result) return false;
  await client.tender.update({ where: { id: tenderId }, data: { aiSummary: result.summary } });
  return true;
}

/** Summarize every OPEN tender still missing a summary (worker job / backfill). */
export async function summarizeMissingTenders(
  client: PrismaClient = prisma,
  limit = 100,
): Promise<number> {
  const rows = await client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT "id" FROM "Tender"
    WHERE "aiSummary" IS NULL AND "status" = 'OPEN'
    ORDER BY "publishedAt" DESC NULLS LAST
    LIMIT ${limit}
  `);
  let count = 0;
  for (const row of rows) {
    try {
      const ok = await summarizeAndStoreTender(row.id, client);
      if (ok) count++;
      else break; // budget exhausted
    } catch (err) {
      logger.error(
        { tenderId: row.id, err: err instanceof Error ? err.message : String(err) },
        "summarize failed",
      );
    }
  }
  return count;
}
