import { prisma } from "../db.js";
import { env } from "../env.js";
import { searchTenders, tenderQuerySchema } from "../api/tenders.js";
import { SHOW_THRESHOLD } from "../ai/match.js";
import { formatGs, referencePercentLabel } from "../format.js";
import { pickDecidingAward } from "../awards.js";
import type { DeliveryChannel } from "./channels.js";

/**
 * Alert candidate collection (PHASE-5 #3, PHASE-F4): for a user, gather tenders
 * worth emailing about from four sources — saved searches, high-score AI matches,
 * changes on followed tenders, and awards on tenders the user is bidding on — then
 * dedupe against AlertLog so a re-run (or a later tick) never re-sends the same
 * (user, tender, reason). This is the "AlertLog dedupe test" acceptance criterion:
 * sending is a one-time event per tender+reason per user, not a recurring
 * reminder. Dedupe is scoped by `reason` (not just tenderId) so a tender can still
 * earn a later, distinct alert — e.g. "match" while OPEN, then "award" once
 * AWARDED — without one suppressing the other.
 */

export type AlertReason = "saved_search" | "match" | "tender_changed" | "award";

export interface AlertCandidate {
  tenderId: string;
  ocid: string;
  title: string;
  buyerName: string | null;
  deadlineAt: Date | null;
  reason: AlertReason;
  reasonLabel: string;
}

// Higher-priority reasons win when the same tender is surfaced by more than one
// source in a single run (PHASE-5 note: "a real profile match reason beats a
// generic saved-search hit"; PHASE-F4 extends this — an award is the most
// specific, valuable thing we can tell a bidder about a tender).
const REASON_PRIORITY: AlertReason[] = ["award", "match", "tender_changed", "saved_search"];

function reasonRank(reason: AlertReason): number {
  return REASON_PRIORITY.indexOf(reason);
}

async function alreadySent(
  userId: string,
  channel: DeliveryChannel,
  tenderIds: string[],
): Promise<Set<string>> {
  if (tenderIds.length === 0) return new Set();
  const rows = await prisma.alertLog.findMany({
    where: { userId, channel, tenderId: { in: tenderIds } },
    select: { tenderId: true, reason: true },
  });
  return new Set(rows.map((r) => `${r.tenderId}:${r.reason}`));
}

async function fromSavedSearches(userId: string): Promise<AlertCandidate[]> {
  const searches = await prisma.savedSearch.findMany({ where: { userId, alerting: true } });
  const out: AlertCandidate[] = [];
  for (const s of searches) {
    const parsed = tenderQuerySchema.safeParse({
      ...(s.params as Record<string, unknown>),
      status: ["OPEN"],
      limit: "20",
    });
    if (!parsed.success) continue; // saved params predate a schema change — skip, don't crash
    const result = await searchTenders(parsed.data);
    if (result.items.length === 0) continue;
    const ids = await prisma.tender.findMany({
      where: { ocid: { in: result.items.map((i) => i.ocid) } },
      select: { id: true, ocid: true },
    });
    const idByOcid = new Map(ids.map((t) => [t.ocid, t.id]));
    for (const item of result.items) {
      const tenderId = idByOcid.get(item.ocid);
      if (!tenderId) continue;
      out.push({
        tenderId,
        ocid: item.ocid,
        title: item.title,
        buyerName: item.buyerName,
        deadlineAt: item.deadlineAt ? new Date(item.deadlineAt) : null,
        reason: "saved_search",
        reasonLabel: `Coincide con "${s.name}"`,
      });
    }
  }
  return out;
}

async function fromMatches(userId: string): Promise<AlertCandidate[]> {
  const matches = await prisma.match.findMany({
    where: {
      profile: { userId },
      score: { gte: Math.max(env.ALERT_MIN_MATCH_SCORE, SHOW_THRESHOLD) },
      userAction: { not: "DISMISSED" },
      tender: { status: "OPEN" },
    },
    include: {
      tender: { select: { id: true, ocid: true, title: true, buyerName: true, deadlineAt: true } },
    },
  });
  return matches.map((m) => ({
    tenderId: m.tender.id,
    ocid: m.tender.ocid,
    title: m.tender.title,
    buyerName: m.tender.buyerName,
    deadlineAt: m.tender.deadlineAt,
    reason: "match" as const,
    reasonLabel: `${m.score}% de coincidencia con tu perfil`,
  }));
}

async function fromFollowedChanges(userId: string): Promise<AlertCandidate[]> {
  const follows = await prisma.followedTender.findMany({
    where: { userId },
    include: {
      tender: {
        select: {
          id: true,
          ocid: true,
          title: true,
          buyerName: true,
          deadlineAt: true,
          status: true,
        },
      },
    },
  });
  const out: AlertCandidate[] = [];
  for (const f of follows) {
    const changed = await prisma.tenderEvent.findFirst({
      where: {
        tenderId: f.tenderId,
        createdAt: { gt: f.createdAt },
        type: { in: ["STATUS_CHANGE", "DEADLINE_CHANGE"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!changed) continue;
    const label =
      changed.type === "STATUS_CHANGE"
        ? `Cambió de estado a ${changed.newValue}`
        : "Se movió la fecha de cierre";
    out.push({
      tenderId: f.tender.id,
      ocid: f.tender.ocid,
      title: f.tender.title,
      buyerName: f.tender.buyerName,
      deadlineAt: f.tender.deadlineAt,
      reason: "tender_changed",
      reasonLabel: label,
    });
  }
  return out;
}

/**
 * Award notifications (PHASE-F4, "¿Por qué perdí?"): a tender the user marked
 * "Voy a ofertar" (Match.userAction = BIDDING) has since been AWARDED, with award
 * data ingested. Surfaces winner name, winning price, and %-below/above the
 * tender's reference amount when computable.
 */
async function fromAwards(userId: string): Promise<AlertCandidate[]> {
  const matches = await prisma.match.findMany({
    where: {
      profile: { userId },
      userAction: "BIDDING",
      tender: { status: "AWARDED" },
    },
    include: {
      tender: {
        select: {
          id: true,
          ocid: true,
          title: true,
          buyerName: true,
          deadlineAt: true,
          amountMax: true,
          awards: { include: { supplier: true } },
        },
      },
    },
  });

  const out: AlertCandidate[] = [];
  for (const m of matches) {
    const award = pickDecidingAward(m.tender.awards);
    if (!award || award.amount === null) continue; // AWARDED but award line not ingested yet
    const winnerName = award.supplier?.name ?? "proveedor no especificado";
    const priceLabel = formatGs(award.amount.toString());
    const pctLabel = referencePercentLabel(
      award.amount.toString(),
      m.tender.amountMax?.toString() ?? null,
    );
    out.push({
      tenderId: m.tender.id,
      ocid: m.tender.ocid,
      title: m.tender.title,
      buyerName: m.tender.buyerName,
      deadlineAt: m.tender.deadlineAt,
      reason: "award",
      reasonLabel: `Se adjudicó a ${winnerName} · ${priceLabel}${pctLabel ? ` (${pctLabel})` : ""}`,
    });
  }
  return out;
}

/**
 * Gathers, dedupes (both within-batch and against AlertLog), and caps candidates.
 * Dedupe is per `channel` (PHASE-F1): a user on email + WhatsApp is told about a
 * tender once on each channel, and a WhatsApp send that failed is retried on the
 * next tick without re-sending the email that already went out.
 */
export async function collectAlertCandidates(
  userId: string,
  channel: DeliveryChannel = "email",
): Promise<AlertCandidate[]> {
  const [saved, matched, changed, awarded] = await Promise.all([
    fromSavedSearches(userId),
    fromMatches(userId),
    fromFollowedChanges(userId),
    fromAwards(userId),
  ]);

  const byTender = new Map<string, AlertCandidate>();
  // Priority (see REASON_PRIORITY): the most specific/valuable reason wins when a
  // tender is surfaced by more than one source at once.
  for (const c of [...saved, ...matched, ...changed, ...awarded]) {
    const existing = byTender.get(c.tenderId);
    if (!existing || reasonRank(c.reason) < reasonRank(existing.reason)) {
      byTender.set(c.tenderId, c);
    }
  }

  const sent = await alreadySent(userId, channel, [...byTender.keys()]);
  const fresh = [...byTender.values()].filter((c) => !sent.has(`${c.tenderId}:${c.reason}`));

  fresh.sort(
    (a, b) => (a.deadlineAt?.getTime() ?? Infinity) - (b.deadlineAt?.getTime() ?? Infinity),
  );
  return fresh.slice(0, env.ALERT_DIGEST_MAX_ITEMS);
}
