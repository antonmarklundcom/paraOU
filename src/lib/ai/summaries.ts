import { prisma } from "../db.js";
import { logger } from "../log.js";
import { getAiProvider } from "./provider.js";
import { budgetExceeded } from "./usage.js";

/**
 * "Resumen en simple" (docs/04): one cached plain-Spanish paragraph per OPEN
 * tender, generated at ingest time — never synchronously from a page render.
 * The summary is invalidated (set NULL) by ingest when tender text changes.
 */
export async function summarizeMissingOpenTenders(opts: { limit?: number } = {}): Promise<number> {
  const tenders = await prisma.tender.findMany({
    where: { status: "OPEN", aiSummary: null },
    orderBy: { publishedAt: "desc" },
    take: opts.limit ?? 50,
    select: {
      id: true,
      title: true,
      description: true,
      buyerName: true,
      categoryName: true,
      procurementMethod: true,
      amountMax: true,
      currency: true,
      deadlineAt: true,
      department: true,
    },
  });

  let done = 0;
  for (const t of tenders) {
    if (await budgetExceeded()) break;
    try {
      const summary = await getAiProvider().summarize({
        ...t,
        amountMax: t.amountMax?.toString() ?? null,
      });
      await prisma.tender.update({ where: { id: t.id }, data: { aiSummary: summary } });
      done += 1;
    } catch (err) {
      logger.error(
        { tenderId: t.id, err: err instanceof Error ? err.message : String(err) },
        "summary generation failed",
      );
      break; // provider trouble affects the whole batch — retry next tick
    }
  }
  if (done > 0) logger.info({ done }, "generated tender summaries");
  return done;
}
