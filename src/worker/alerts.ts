import type { PrismaClient, User } from "@prisma/client";
import { prisma } from "../lib/db.js";
import { logger as rootLogger, type Logger } from "../lib/log.js";
import { sendEmail } from "../lib/email/transport.js";
import {
  digestSubject,
  renderDigestHtml,
  renderDigestText,
  type DigestItem,
} from "../lib/email/digest.js";
import { unsubscribeToken } from "../lib/email/unsubscribe.js";
import { searchTenders, tenderQuerySchema } from "../lib/api/tenders.js";
import { ALERT_THRESHOLD } from "../lib/ai/matching.js";

/**
 * Alert engine (PHASE-5 step 3): for each user due for a digest, gather new items
 * from three sources — high Match scores, saved-search hits, and changes on
 * followed tenders — dedupe against AlertLog, cap at 10, send one digest email.
 *
 * Dedupe ordering: AlertLog rows for the items actually included are written
 * BEFORE sending (log-first). This guarantees a tender is never alerted twice even
 * if the send itself fails or is retried — the tradeoff is that a failed send does
 * not get retried for those specific tenders; they simply won't reappear. Given the
 * digest cadence (daily) and the low stakes of a missed one-time notification, this
 * favors "never spam" over "never miss," which matches docs/05's "AlertLog dedupe"
 * requirement literally (a re-run after a successful send must send nothing).
 */

const MAX_ITEMS = 10;
const INTERVAL_MS: Record<string, number> = {
  INSTANT: 0,
  DAILY: 24 * 60 * 60 * 1000,
  WEEKLY: 7 * 24 * 60 * 60 * 1000,
};

function isDue(user: User, now: number): boolean {
  if (user.alertFrequency === "NONE") return false;
  const intervalMs = INTERVAL_MS[user.alertFrequency] ?? INTERVAL_MS.DAILY!;
  if (intervalMs === 0) return true;
  if (!user.lastDigestAt) return true;
  return now - user.lastDigestAt.getTime() >= intervalMs;
}

interface Candidate {
  tenderId: string;
  ocid: string;
  title: string;
  buyerName: string | null;
  amountMax: string | null;
  deadlineAt: Date | null;
  reason: string;
}

async function matchCandidates(client: PrismaClient, profileIds: string[]): Promise<Candidate[]> {
  if (profileIds.length === 0) return [];
  const matches = await client.match.findMany({
    where: { profileId: { in: profileIds }, score: { gte: ALERT_THRESHOLD } },
    include: { tender: true },
  });
  return matches.map((m) => ({
    tenderId: m.tender.id,
    ocid: m.tender.ocid,
    title: m.tender.title,
    buyerName: m.tender.buyerName,
    amountMax: m.tender.amountMax?.toString() ?? null,
    deadlineAt: m.tender.deadlineAt,
    reason: `${m.score}% de coincidencia con tu perfil.`,
  }));
}

async function savedSearchCandidates(
  client: PrismaClient,
  profileIds: string[],
): Promise<Candidate[]> {
  if (profileIds.length === 0) return [];
  const searches = await client.savedSearch.findMany({
    where: { profileId: { in: profileIds }, alerting: true },
  });
  const out: Candidate[] = [];
  for (const search of searches) {
    const parsed = tenderQuerySchema.safeParse(search.params);
    if (!parsed.success) continue; // stored filter shape no longer valid, skip
    const result = await searchTenders({ ...parsed.data, limit: 20 });
    for (const item of result.items) {
      out.push({
        tenderId: item.ocid, // resolved to a real Tender.id below via ocid map
        ocid: item.ocid,
        title: item.title,
        buyerName: item.buyerName,
        amountMax: item.amountMax,
        deadlineAt: item.deadlineAt ? new Date(item.deadlineAt) : null,
        reason: `Coincide con tu búsqueda guardada "${search.name}".`,
      });
    }
  }
  if (out.length === 0) return out;
  // searchTenders() doesn't return internal ids — resolve ocid -> id in one query.
  const tenders = await client.tender.findMany({
    where: { ocid: { in: out.map((o) => o.ocid) } },
    select: { id: true, ocid: true },
  });
  const idByOcid = new Map(tenders.map((t) => [t.ocid, t.id]));
  return out
    .map((c) => ({ ...c, tenderId: idByOcid.get(c.ocid) ?? "" }))
    .filter((c) => c.tenderId !== "");
}

async function followedChangeCandidates(
  client: PrismaClient,
  userId: string,
  since: Date,
): Promise<Candidate[]> {
  const follows = await client.follow.findMany({ where: { userId }, select: { tenderId: true } });
  if (follows.length === 0) return [];
  const tenderIds = follows.map((f) => f.tenderId);

  const events = await client.tenderEvent.findMany({
    where: {
      tenderId: { in: tenderIds },
      createdAt: { gte: since },
      type: { in: ["STATUS_CHANGE", "DEADLINE_CHANGE"] },
    },
    include: { tender: true },
    orderBy: { createdAt: "desc" },
  });

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const e of events) {
    if (seen.has(e.tenderId)) continue; // one alert per tender per run, even if multiple fields changed
    seen.add(e.tenderId);
    const label = e.type === "STATUS_CHANGE" ? "Cambió el estado" : "Cambió la fecha de cierre";
    out.push({
      tenderId: e.tender.id,
      ocid: e.tender.ocid,
      title: e.tender.title,
      buyerName: e.tender.buyerName,
      amountMax: e.tender.amountMax?.toString() ?? null,
      deadlineAt: e.tender.deadlineAt,
      reason: `${label} en una licitación que seguís.`,
    });
  }
  return out;
}

function dedupeByTender(candidates: Candidate[]): Candidate[] {
  const byTender = new Map<string, Candidate>();
  for (const c of candidates) if (!byTender.has(c.tenderId)) byTender.set(c.tenderId, c);
  return [...byTender.values()];
}

function sortDeadlineFirst(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) => {
    if (!a.deadlineAt && !b.deadlineAt) return 0;
    if (!a.deadlineAt) return 1;
    if (!b.deadlineAt) return -1;
    return a.deadlineAt.getTime() - b.deadlineAt.getTime();
  });
}

function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  return Math.ceil((deadline.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export interface AlertRunStats {
  usersDue: number;
  digestsSent: number;
  itemsAlerted: number;
}

/** Process one user: gather, dedupe against AlertLog, cap, send, advance lastDigestAt. */
async function processUser(client: PrismaClient, user: User, logger: Logger): Promise<boolean> {
  const profiles = await client.companyProfile.findMany({
    where: { userId: user.id },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);
  const since = user.lastDigestAt ?? new Date(user.createdAt);

  const raw = [
    ...(await matchCandidates(client, profileIds)),
    ...(await savedSearchCandidates(client, profileIds)),
    ...(await followedChangeCandidates(client, user.id, since)),
  ];
  const deduped = dedupeByTender(raw);

  // Exclude anything already alerted (AlertLog dedupe — the acceptance criterion:
  // re-running after a successful send emails nothing).
  const alreadyAlerted = await client.alertLog.findMany({
    where: { userId: user.id, tenderId: { in: deduped.map((c) => c.tenderId) }, channel: "EMAIL" },
    select: { tenderId: true },
  });
  const alertedSet = new Set(alreadyAlerted.map((a) => a.tenderId));
  const fresh = sortDeadlineFirst(deduped.filter((c) => !alertedSet.has(c.tenderId))).slice(
    0,
    MAX_ITEMS,
  );

  await client.user.update({ where: { id: user.id }, data: { lastDigestAt: new Date() } });

  if (fresh.length === 0) return false;

  // Log-first: these tenders are considered alerted whether or not the send below
  // ultimately succeeds (see file-level doc comment).
  await client.alertLog.createMany({
    data: fresh.map((c) => ({ userId: user.id, tenderId: c.tenderId, channel: "EMAIL" })),
    skipDuplicates: true,
  });

  const companyName =
    profiles.length > 0
      ? ((await client.companyProfile.findUnique({ where: { id: profiles[0]!.id } }))?.name ??
        "tu empresa")
      : (user.name ?? "tu empresa");

  const items: DigestItem[] = fresh.map((c) => ({
    ocid: c.ocid,
    title: c.title,
    buyerName: c.buyerName,
    amountMax: c.amountMax,
    deadlineAt: c.deadlineAt ? c.deadlineAt.toISOString() : null,
    daysUntilDeadline: daysUntil(c.deadlineAt),
    reason: c.reason,
  }));

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const token = unsubscribeToken(user.id);
  const unsubscribeUrl = `${appUrl}/api/unsubscribe?token=${token}`;
  const digestInput = { companyName, appUrl, items, unsubscribeUrl };

  const result = await sendEmail({
    to: user.email,
    subject: digestSubject(digestInput),
    html: renderDigestHtml(digestInput),
    text: renderDigestText(digestInput),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (!result.ok) {
    logger.error({ userId: user.id, error: result.error }, "digest send failed");
    return false;
  }
  return true;
}

export async function runAlertEngine(
  client: PrismaClient = prisma,
  logger: Logger = rootLogger,
): Promise<AlertRunStats> {
  const now = Date.now();
  const candidates = await client.user.findMany({ where: { alertChannel: "EMAIL" } });
  const due = candidates.filter((u) => isDue(u, now));

  const stats: AlertRunStats = { usersDue: due.length, digestsSent: 0, itemsAlerted: 0 };
  for (const user of due) {
    const sent = await processUser(client, user, logger);
    if (sent) stats.digestsSent++;
  }
  logger.info(stats, "alert engine finished");
  return stats;
}
