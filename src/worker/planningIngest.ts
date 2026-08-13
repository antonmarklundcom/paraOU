import type { PrismaClient } from "@prisma/client";
import type { PlanificacionItem } from "../lib/dncp/planning.js";
import { mapPlanificacion, type MappedPlannedPurchase } from "../lib/dncp/mapPlanning.js";
import type { IngestStats } from "./ingest.js";
import { emptyStats } from "./ingest.js";

/**
 * Idempotent ingestion of mapped PAC entries (F3 "PAC early-warning" — same
 * pattern as `ingest.ts` for tenders, CLAUDE.md rule 4: raw JSON preserved).
 * Upsert by `externalId` (the DNCP PAC entry id) so re-running a sync produces
 * zero duplicates. The buyer is upserted the same way tenders upsert their
 * buyer — a PAC entry and its eventual tender end up pointing at the same
 * `Buyer` row.
 */

/** Upsert a single mapped planned purchase. Returns whether it was new. */
export async function upsertPlannedPurchase(
  prisma: PrismaClient,
  m: MappedPlannedPurchase,
): Promise<{ action: "created" | "updated" }> {
  return prisma.$transaction(async (tx) => {
    if (m.buyerId) {
      await tx.buyer.upsert({
        where: { id: m.buyerId },
        create: { id: m.buyerId, name: m.buyerName ?? m.buyerId, ruc: m.buyerRuc, level: null },
        update: { name: m.buyerName ?? m.buyerId, ruc: m.buyerRuc },
      });
    }

    const existing = await tx.plannedPurchase.findUnique({
      where: { externalId: m.externalId },
      select: { id: true },
    });

    const data = {
      ocid: m.ocid,
      year: m.year,
      title: m.title,
      description: m.description,
      status: m.status,
      buyerId: m.buyerId,
      buyerName: m.buyerName,
      categoryCode: m.categoryCode,
      categoryName: m.categoryName,
      procurementMethod: m.procurementMethod,
      estimatedAmount: m.estimatedAmount,
      currency: m.currency,
      department: m.department,
      estimatedQuarter: m.estimatedQuarter,
      estimatedDate: m.estimatedDate,
      publishedAt: m.publishedAt,
      raw: m.raw as object,
    };

    if (existing) {
      await tx.plannedPurchase.update({ where: { id: existing.id }, data });
      return { action: "updated" as const };
    }

    await tx.plannedPurchase.create({ data: { externalId: m.externalId, ...data } });
    return { action: "created" as const };
  });
}

/** Map + ingest a batch of PAC entries, accumulating stats. */
export async function ingestPlanificaciones(
  prisma: PrismaClient,
  items: PlanificacionItem[],
): Promise<IngestStats> {
  const stats = emptyStats();
  for (const item of items) {
    let mapped: MappedPlannedPurchase;
    try {
      mapped = mapPlanificacion(item);
    } catch {
      stats.skipped += 1;
      continue;
    }
    const { action } = await upsertPlannedPurchase(prisma, mapped);
    if (action === "created") stats.created += 1;
    else stats.updated += 1;
  }
  return stats;
}
