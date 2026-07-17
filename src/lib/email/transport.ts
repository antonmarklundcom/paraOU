import { mkdir, appendFile, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { env, emailConfigured } from "../env.js";
import { logger } from "../log.js";

/**
 * Outbound email transport (PHASE-5 step 5): dev = local file outbox, prod =
 * Resend. Both magic-link sign-in (Auth.js) and the alert digest go through this
 * one function so there is exactly one place that knows how to actually send mail.
 *
 * Resend's REST shape (`POST https://api.resend.com/emails`, `Authorization: Bearer
 * <key>`, body `{ from, to, subject, html, text, headers }`) is taken from Auth.js's
 * own built-in Resend provider source (packages/core/src/providers/resend.ts in
 * nextauthjs/next-auth, fetched 2026-07-16) — the same request shape works for our
 * own sends, not just magic links.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Extra headers, e.g. one-click List-Unsubscribe (docs/05: deliverability matters). */
  headers?: Record<string, string>;
}

interface SendResult {
  ok: boolean;
  transport: "resend" | "dev-outbox";
  error?: string;
}

async function sendViaResend(email: OutgoingEmail): Promise<SendResult> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      headers: email.headers,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, transport: "resend", error: `Resend ${res.status}: ${body.slice(0, 300)}` };
  }
  return { ok: true, transport: "resend" };
}

/** Appends the email to a local JSONL file. Dev/e2e only — never used in
 * production (loadEnv() requires AUTH_SECRET there, but transport selection is
 * independently gated by emailConfigured()/RESEND_API_KEY, so document the
 * expectation clearly: set RESEND_API_KEY before deploying). */
async function sendViaDevOutbox(email: OutgoingEmail): Promise<SendResult> {
  const path = env.DEV_EMAIL_OUTBOX_PATH;
  await mkdir(dirname(path), { recursive: true });
  const line = JSON.stringify({ ...email, sentAt: new Date().toISOString() });
  await appendFile(path, line + "\n", "utf8");
  logger.info(
    { to: email.to, subject: email.subject, path },
    "email written to dev outbox (no RESEND_API_KEY)",
  );
  return { ok: true, transport: "dev-outbox" };
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  if (emailConfigured()) return sendViaResend(email);
  return sendViaDevOutbox(email);
}

/** Read the most recent dev-outbox email to `to` (or the very last one if `to` is
 * omitted). Used only by the dev-only /api/dev/last-email route for e2e testing. */
export async function readLastDevEmail(to?: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(env.DEV_EMAIL_OUTBOX_PATH, "utf8");
    const lines = content.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const parsed = JSON.parse(lines[i]!) as Record<string, unknown>;
      if (!to || parsed.to === to) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
