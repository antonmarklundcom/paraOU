import { prisma } from "../db.js";
import { env } from "../env.js";
import { searchTenders, tenderQuerySchema } from "../api/tenders.js";
import { SHOW_THRESHOLD } from "../ai/match.js";

/**
 * Alert candidate collection (PHASE-5 #3): for a user, gather tenders worth
 * emailing about from three sources — saved searches, high-score AI matches, and
 * changes on followed tenders — then dedupe against AlertLog so a re-run (or a
 * later tick) never re-sends the same (user, tender) pair. This is the
 * "AlertLog dedupe test" acceptance criterion: sending is a one-time event per
 * tender per user, not a recurring reminder.
 */

export type AlertReason = "saved_search" | "match" | "tender_changed";

export interface AlertCandidate {
  tenderId: string;
  ocid: string;
  title: string;
  buyerName: string | null;
  deadlineAt: Date | null;
  reason: AlertReason;
  reasonLabel: string;
}

async function alreadySent(userId: string, tenderIds: string[]): Promise<Set<string>> {
  if (tenderIds.length === 0) return new Set();
  const rows = await prisma.alertLog.findMany({
    where: { userId, channel: "email", tenderId: { in: tenderIds } },
    select: { tenderId: true },
  });
  return new Set(rows.map((r) => r.tenderId));
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
    include: { tender: { select: { id: true, ocid: true, title: true, buyerName: true, deadlineAt: true } } },
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
    include: { tender: { select: { id: true, ocid: true, title: true, buyerName: true, deadlineAt: true, status: true } } },
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

/** Gathers, dedupes (both within-batch and against AlertLog), and caps candidates. */
export async function collectAlertCandidates(userId: string): Promise<AlertCandidate[]> {
  const [saved, matched, changed] = await Promise.all([
    fromSavedSearches(userId),
    fromMatches(userId),
    fromFollowedChanges(userId),
  ]);

  const byTender = new Map<string, AlertCandidate>();
  // Priority: a real profile match reason beats a generic saved-search hit when
  // both apply to the same tender.
  for (const c of [...saved, ...matched, ...changed]) {
    const existing = byTender.get(c.tenderId);
    if (!existing || (existing.reason === "saved_search" && c.reason !== "saved_search")) {
      byTender.set(c.tenderId, c);
    }
  }

  const sent = await alreadySent(userId, [...byTender.keys()]);
  const fresh = [...byTender.values()].filter((c) => !sent.has(c.tenderId));

  fresh.sort((a, b) => (a.deadlineAt?.getTime() ?? Infinity) - (b.deadlineAt?.getTime() ?? Infinity));
  return fresh.slice(0, env.ALERT_DIGEST_MAX_ITEMS);
}
