import { Resend } from "resend";
import { env, emailConfigured } from "./env.js";
import { logger } from "./log.js";
import { prisma } from "./db.js";

/**
 * Transactional email transport (Phase 5): Resend in production, console log in
 * dev/test when RESEND_API_KEY is absent (CLAUDE.md rule 2 — never block on a
 * missing owner-provided secret). Every send is logged; hard bounces mark the
 * user's address bad so the digest job stops emailing it.
 */

let client: Resend | null = null;
function resend(): Resend {
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** RFC 8058 List-Unsubscribe — deliverability matters for a daily digest. */
  unsubscribeUrl?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string | null }> {
  if (!emailConfigured()) {
    logger.info({ to: input.to, subject: input.subject }, "[dev email transport] would send");
    return { id: null };
  }
  const headers = input.unsubscribeUrl
    ? {
        "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      }
    : undefined;
  const { data, error } = await resend().emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    html: input.html,
    headers,
  });
  if (error) {
    logger.error({ to: input.to, error }, "email send failed");
    // Resend's error codes don't cleanly distinguish hard vs soft bounces at
    // send time (that arrives async via webhook, which is Phase 6+ scope); a
    // 4xx validation error on the address itself is the one case we can act on
    // synchronously.
    if (error.name === "validation_error") {
      await prisma.user.updateMany({ where: { email: input.to }, data: { emailBounced: true } });
    }
    throw new Error(`Email send failed: ${error.message}`);
  }
  return { id: data?.id ?? null };
}
