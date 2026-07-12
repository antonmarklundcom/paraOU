import { render } from "@react-email/render";
import { prisma } from "../db.js";
import { logger } from "../log.js";
import { sendEmail } from "../email.js";
import { deadlinePhrase } from "../format.js";
import { daysUntil } from "./daysUntil.js";
import { collectAlertCandidates } from "./collect.js";
import { DigestEmail, digestSubject, type DigestItem } from "./DigestEmail.js";

/**
 * Alert engine (PHASE-5 #3): one function per user — collect candidates, and if
 * any, send exactly one digest email and log every included tender to AlertLog
 * (the dedupe: a re-run or later tick will never re-send those same pairs).
 * `frequencies` filters which User.alertFrequency values this run covers, so the
 * worker can wire INSTANT to every sync tick and DAILY/WEEKLY to their own cron
 * schedules without re-sending across schedules.
 *
 * Plan gating (docs/04 "FREE: none or weekly teaser") is a Phase 6 hook once
 * billing exists — every plan currently gets its chosen alertFrequency.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export interface DigestResult {
  userId: string;
  sent: boolean;
  itemCount: number;
}

export async function sendDigestForUser(userId: string): Promise<DigestResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.alertChannel === "NONE" || user.emailBounced) {
    return { userId, sent: false, itemCount: 0 };
  }

  const candidates = await collectAlertCandidates(userId);
  if (candidates.length === 0) return { userId, sent: false, itemCount: 0 };

  const profile = await prisma.companyProfile.findFirst({ where: { userId } });
  const companyName = profile?.name ?? "vos";
  const items: DigestItem[] = candidates.map((c) => ({
    ocid: c.ocid,
    title: c.title,
    buyerName: c.buyerName,
    deadlineLabel: deadlinePhrase(daysUntil(c.deadlineAt)),
    reasonLabel: c.reasonLabel,
  }));

  const unsubscribeUrl = `${APP_URL}/cuenta`;
  const html = await render(
    DigestEmail({ appUrl: APP_URL, companyName, items, unsubscribeUrl }),
  );

  await sendEmail({
    to: user.email,
    subject: digestSubject(companyName, items),
    html,
    unsubscribeUrl,
  });

  // Log AFTER a successful send — a failed send must be retried next run, not
  // silently marked as sent (the AlertLog unique constraint is the dedupe).
  await prisma.alertLog.createMany({
    data: candidates.map((c) => ({
      userId,
      tenderId: c.tenderId,
      channel: "email",
      reason: c.reason,
    })),
    skipDuplicates: true,
  });

  logger.info({ userId, items: items.length }, "sent alert digest");
  return { userId, sent: true, itemCount: items.length };
}

/** Runs the digest job for every user whose alertFrequency is in `frequencies`. */
export async function runAlertEngine(
  frequencies: ("INSTANT" | "DAILY" | "WEEKLY")[],
): Promise<DigestResult[]> {
  const users = await prisma.user.findMany({
    where: { alertChannel: "EMAIL", alertFrequency: { in: frequencies }, emailBounced: false },
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
