import type { PrismaClient } from "@prisma/client";
import type { OcdsRecord } from "../lib/dncp/ocds.js";
import { mapRecord, type MappedTender } from "../lib/dncp/map.js";

/**
 * Idempotent ingestion of mapped tenders (PHASE-1 step 5).
 *
 * Upsert by `ocid` (the OCDS business key, docs/02) so re-running a sync produces
 * zero duplicates. Buyers/suppliers upsert by their OCDS party id. Awards are keyed
 * by `${ocid}:${awardId}` (OCDS award ids are only unique within a process) and
 * fully replaced on each ingest. Status/deadline/amount changes are recorded as
 * TenderEvents for the alerting layer (Phase 5).
 */

export interface IngestStats {
  created: number;
  updated: number;
  events: number;
  skipped: number;
}

export function emptyStats(): IngestStats {
  return { created: 0, updated: 0, events: 0, skipped: 0 };
}

function awardPk(ocid: string, awardId: string): string {
  return `${ocid}:${awardId}`;
}

type EventDraft = {
  type: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
};

function diffEvents(
  prev: {
    status: string;
    deadlineAt: Date | null;
    amountMax: unknown;
  },
  next: MappedTender,
): EventDraft[] {
  const events: EventDraft[] = [];
  if (prev.status !== next.status) {
    events.push({
      type: "STATUS_CHANGE",
      field: "status",
      oldValue: prev.status,
      newValue: next.status,
    });
  }
  const prevDeadline = prev.deadlineAt ? prev.deadlineAt.toISOString() : null;
  const nextDeadline = next.deadlineAt ? next.deadlineAt.toISOString() : null;
  if (prevDeadline !== nextDeadline) {
    events.push({
      type: "DEADLINE_CHANGE",
      field: "deadlineAt",
      oldValue: prevDeadline,
      newValue: nextDeadline,
    });
  }
  const prevAmount =
    prev.amountMax === null || prev.amountMax === undefined ? null : String(prev.amountMax);
  const nextAmount = next.amountMax;
  if (prevAmount !== nextAmount) {
    events.push({
      type: "AMOUNT_CHANGE",
      field: "amountMax",
      oldValue: prevAmount,
      newValue: nextAmount,
    });
  }
  return events;
}

/** Upsert a single mapped tender and its related rows. Returns whether it was new. */
export async function upsertTender(
  prisma: PrismaClient,
  m: MappedTender,
): Promise<{ action: "created" | "updated"; events: number }> {
  return prisma.$transaction(async (tx) => {
    // Buyer (denormalized owner of the tender).
    if (m.buyer) {
      await tx.buyer.upsert({
        where: { id: m.buyer.id },
        create: { id: m.buyer.id, name: m.buyer.name, ruc: m.buyer.ruc, level: m.buyer.level },
        update: { name: m.buyer.name, ruc: m.buyer.ruc, level: m.buyer.level },
      });
    }

    // Suppliers referenced by awards.
    for (const award of m.awards) {
      if (award.supplier) {
        await tx.supplier.upsert({
          where: { id: award.supplier.id },
          create: { id: award.supplier.id, name: award.supplier.name, ruc: award.supplier.ruc },
          update: { name: award.supplier.name, ruc: award.supplier.ruc },
        });
      }
    }

    const existing = await tx.tender.findUnique({
      where: { ocid: m.ocid },
      select: { id: true, status: true, deadlineAt: true, amountMax: true },
    });

    const data = {
      dncpId: m.dncpId,
      title: m.title,
      description: m.description,
      status: m.status,
      buyerId: m.buyer?.id ?? null,
      buyerName: m.buyerName,
      categoryCode: m.categoryCode,
      categoryName: m.categoryName,
      procurementMethod: m.procurementMethod,
      amountMin: m.amountMin,
      amountMax: m.amountMax,
      currency: m.currency,
      department: m.department,
      publishedAt: m.publishedAt,
      deadlineAt: m.deadlineAt,
      inquiryDeadlineAt: m.inquiryDeadlineAt,
      documentsUrl: m.documentsUrl,
      sourceUrl: m.sourceUrl,
      raw: m.raw as object,
    };

    let tenderId: string;
    let action: "created" | "updated";
    const eventDrafts: EventDraft[] = [];

    if (existing) {
      action = "updated";
      tenderId = existing.id;
      eventDrafts.push(...diffEvents(existing, m));
      await tx.tender.update({ where: { id: existing.id }, data });
    } else {
      action = "created";
      const created = await tx.tender.create({
        data: { ocid: m.ocid, ...data },
        select: { id: true },
      });
      tenderId = created.id;
      eventDrafts.push({ type: "NEW", newValue: m.status });
    }

    // Fully replace awards for this tender (idempotent).
    await tx.award.deleteMany({ where: { tenderId } });
    for (const award of m.awards) {
      await tx.award.create({
        data: {
          id: awardPk(m.ocid, award.id),
          tenderId,
          supplierId: award.supplier?.id ?? null,
          amount: award.amount,
          currency: award.currency,
          date: award.date,
          status: award.status,
        },
      });
    }

    for (const ev of eventDrafts) {
      await tx.tenderEvent.create({
        data: {
          tenderId,
          type: ev.type,
          field: ev.field ?? null,
          oldValue: ev.oldValue ?? null,
          newValue: ev.newValue ?? null,
        },
      });
    }

    return { action, events: eventDrafts.length };
  });
}

/** Map + ingest a batch of OCDS records, accumulating stats. */
export async function ingestRecords(
  prisma: PrismaClient,
  records: OcdsRecord[],
): Promise<IngestStats> {
  const stats = emptyStats();
  for (const record of records) {
    const mapped = mapRecord(record);
    if (!mapped) {
      stats.skipped += 1;
      continue;
    }
    const { action, events } = await upsertTender(prisma, mapped);
    if (action === "created") stats.created += 1;
    else stats.updated += 1;
    stats.events += events;
  }
  return stats;
}
