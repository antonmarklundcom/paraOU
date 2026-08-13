import { render } from "@react-email/render";
import { prisma } from "../db.js";
import { logger } from "../log.js";
import { sendEmail } from "../email.js";
import { deadlinePhrase } from "../format.js";
import { sendWhatsappTemplate } from "../whatsapp/outbox.js";
import { daysUntil } from "./daysUntil.js";
import { collectAlertCandidates, type AlertCandidate } from "./collect.js";
import { DigestEmail, digestSubject, type DigestItem } from "./DigestEmail.js";
import { buildWhatsappDigest } from "./whatsappDigest.js";
import { eligibleChannels, type DeliveryChannel } from "./channels.js";

/**
 * Alert engine (PHASE-5 #3, extended in PHASE-F1): one function per user —
 * for each *eligible delivery channel*, collect candidates and, if any, send
 * exactly one digest and log every included tender to AlertLog (the dedupe: a
 * re-run or later tick never re-sends those same pairs on that channel).
 *
 * Channels are two implementations of one abstraction, not two alert systems:
 * collection, priority, dedupe, caps and scheduling are shared; a channel only
 * decides how a `DigestItem[]` becomes a message. `channels.ts` answers who is
 * eligible (plan gating, bounced email, unverified/failed/opted-out WhatsApp).
 *
 * `frequencies` filters which User.alertFrequency values this run covers, so the
 * worker can wire INSTANT to every sync tick and DAILY/WEEKLY to their own cron
 * schedules without re-sending across schedules.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export interface ChannelResult {
  channel: DeliveryChannel;
  sent: boolean;
  itemCount: number;
}

export interface DigestResult {
  userId: string;
  /** True when at least one channel delivered. */
  sent: boolean;
  /** Items delivered on the channel that sent the most (email-era shape). */
  itemCount: number;
  channels: ChannelResult[];
}

function toDigestItems(candidates: AlertCandidate[]): DigestItem[] {
  return candidates.map((c) => ({
    ocid: c.ocid,
    title: c.title,
    buyerName: c.buyerName,
    deadlineLabel: deadlinePhrase(daysUntil(c.deadlineAt)),
    reasonLabel: c.reasonLabel,
  }));
}

async function deliverEmail(
  user: { id: string; email: string },
  companyName: string,
  items: DigestItem[],
): Promise<void> {
  const unsubscribeUrl = `${APP_URL}/cuenta`;
  const html = await render(DigestEmail({ appUrl: APP_URL, companyName, items, unsubscribeUrl }));
  await sendEmail({
    to: user.email,
    subject: digestSubject(companyName, items),
    html,
    unsubscribeUrl,
  });
}

async function deliverWhatsapp(
  user: { id: string; whatsappPhone: string | null },
  companyName: string,
  items: DigestItem[],
): Promise<void> {
  if (!user.whatsappPhone) return;
  const message = buildWhatsappDigest(APP_URL, companyName, items);
  if (!message) return;
  await sendWhatsappTemplate({
    userId: user.id,
    to: user.whatsappPhone,
    template: message.template,
    variables: message.variables,
    purpose: message.template === "deadline" ? "deadline" : "digest",
    itemCount: items.length,
  });
}

export async function sendDigestForUser(userId: string): Promise<DigestResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const channels = eligibleChannels(user);
  const empty: DigestResult = { userId, sent: false, itemCount: 0, channels: [] };
  if (channels.length === 0) return empty;

  const profile = await prisma.companyProfile.findFirst({ where: { userId } });
  const companyName = profile?.name ?? "vos";

  const results: ChannelResult[] = [];
  for (const channel of channels) {
    // Each channel has its own AlertLog history, so a channel added later (or one
    // that failed last tick) catches up on its own without spamming the other.
    const candidates = await collectAlertCandidates(userId, channel);
    if (candidates.length === 0) {
      results.push({ channel, sent: false, itemCount: 0 });
      continue;
    }
    const items = toDigestItems(candidates);

    try {
      if (channel === "email") {
        await deliverEmail(user, companyName, items);
      } else {
        await deliverWhatsapp(user, companyName, items);
      }
    } catch (err) {
      // One channel failing must not cost the user the other one, and must not
      // mark these tenders as sent — the next tick retries this channel only.
      logger.error(
        { userId, channel, err: err instanceof Error ? err.message : String(err) },
        "alert channel delivery failed",
      );
      results.push({ channel, sent: false, itemCount: 0 });
      continue;
    }

    // Log AFTER a successful send — a failed send must be retried next run, not
    // silently marked as sent (the AlertLog unique constraint is the dedupe).
    await prisma.alertLog.createMany({
      data: candidates.map((c) => ({
        userId,
        tenderId: c.tenderId,
        channel,
        reason: c.reason,
      })),
      skipDuplicates: true,
    });
    logger.info({ userId, channel, items: items.length }, "sent alert digest");
    results.push({ channel, sent: true, itemCount: items.length });
  }

  return {
    userId,
    sent: results.some((r) => r.sent),
    itemCount: Math.max(0, ...results.map((r) => r.itemCount)),
    channels: results,
  };
}

/** Runs the digest job for every user whose alertFrequency is in `frequencies`. */
export async function runAlertEngine(
  frequencies: ("INSTANT" | "DAILY" | "WEEKLY")[],
): Promise<DigestResult[]> {
  const users = await prisma.user.findMany({
    // Channel-level eligibility (bounced email, WhatsApp status/plan) is decided
    // per user in `eligibleChannels`; the query only skips users who asked for
    // no alerts at all.
    where: { alertChannel: { not: "NONE" }, alertFrequency: { in: frequencies } },
    select: { id: true },
  });
  const results: DigestResult[] = [];
  for (const u of users) {
    try {
      results.push(await sendDigestForUser(u.id));
    } catch (err) {
      logger.error(
        { userId: u.id, err: err instanceof Error ? err.message : String(err) },
        "alert digest failed for user",
      );
    }
  }
  return results;
}
