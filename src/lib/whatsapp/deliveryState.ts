import type { WhatsappDeliveryStatus } from "@prisma/client";

/**
 * Delivery-state machine for outbound WhatsApp messages (PHASE-F1 #3).
 *
 * WhatsApp delivery is asynchronous and reported over a webhook, which means
 * three things the code must survive:
 *
 *  1. **Out-of-order events.** `read` can land before `delivered`; a retried
 *     `sent` callback can land after both. State must therefore be *monotonic*
 *     along the success path — never regress.
 *  2. **Duplicate events.** Providers retry callbacks until they get a 2xx, so
 *     every transition has to be idempotent (applying it twice == once).
 *  3. **Terminal failure.** `failed` / `undelivered` end the message's life.
 *     They also drive the opt-out safety valve: N consecutive failures for a
 *     user marks the number FAILED so the alert engine stops retrying forever.
 *
 * The rule set below is deliberately tiny and pure so it can be unit-tested
 * without a database or a provider.
 */

/** Progress along the happy path. Higher wins; equal or lower is ignored. */
const SUCCESS_RANK: Record<WhatsappDeliveryStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  UNDELIVERED: -1,
  FAILED: -1,
};

export function isTerminalFailure(status: WhatsappDeliveryStatus): boolean {
  return status === "FAILED" || status === "UNDELIVERED";
}

/** True once the provider has confirmed the handset received the message. */
export function isDelivered(status: WhatsappDeliveryStatus): boolean {
  return status === "DELIVERED" || status === "READ";
}

/**
 * Folds an incoming provider status into the stored one and returns the status
 * to persist. Pure, idempotent, and safe against replays and reordering.
 */
export function nextDeliveryStatus(
  current: WhatsappDeliveryStatus,
  incoming: WhatsappDeliveryStatus,
): WhatsappDeliveryStatus {
  if (current === incoming) return current;

  // A terminal failure is the end of this message. A late success callback for
  // an already-failed message is stale (or a different attempt) — ignore it.
  if (isTerminalFailure(current)) return current;

  if (isTerminalFailure(incoming)) {
    // A failure that arrives *after* proof of delivery is nonsensical
    // (providers do emit late `undelivered` on retry edge cases); trust the
    // stronger evidence — the handset already got it.
    return isDelivered(current) ? current : incoming;
  }

  return SUCCESS_RANK[incoming] > SUCCESS_RANK[current] ? incoming : current;
}

/**
 * Whether a transition should count against the user's consecutive-failure
 * budget. Only the *entry* into a terminal failure counts, so duplicate webhook
 * deliveries of the same `failed` event never inflate the counter.
 */
export function countsAsFailure(
  current: WhatsappDeliveryStatus,
  next: WhatsappDeliveryStatus,
): boolean {
  return isTerminalFailure(next) && !isTerminalFailure(current);
}

/** Entering DELIVERED/READ clears the consecutive-failure budget. */
export function countsAsSuccess(
  current: WhatsappDeliveryStatus,
  next: WhatsappDeliveryStatus,
): boolean {
  return isDelivered(next) && !isDelivered(current);
}

/**
 * Provider error codes that mean "this number will never work" — no point
 * burning the retry budget three times over. Twilio's 63003 (recipient not
 * found) / 63024 (invalid number) / 21211 (invalid To) are permanent; a
 * 63016-style template error is *our* bug, not the user's number, so it must
 * NOT poison their channel.
 */
const PERMANENT_RECIPIENT_ERRORS = new Set(["21211", "21614", "63003", "63024", "63005"]);
/** Errors that are our own misconfiguration — never penalize the recipient. */
const SENDER_SIDE_ERRORS = new Set(["63016", "63018", "63021", "20003", "21606"]);

export type FailureKind = "permanent_recipient" | "sender_side" | "transient";

export function classifyFailure(errorCode: string | null | undefined): FailureKind {
  if (!errorCode) return "transient";
  const code = String(errorCode).trim();
  if (PERMANENT_RECIPIENT_ERRORS.has(code)) return "permanent_recipient";
  if (SENDER_SIDE_ERRORS.has(code)) return "sender_side";
  return "transient";
}

/**
 * The consecutive-failure count to store, given the previous count and the
 * failure just observed. A permanent recipient error jumps straight to the
 * ceiling (one strike is proof enough); a sender-side error leaves the count
 * untouched so our own template/config mistakes never opt a user out.
 */
export function nextFailureCount(previous: number, kind: FailureKind, maxFailures: number): number {
  if (kind === "sender_side") return previous;
  if (kind === "permanent_recipient") return maxFailures;
  return previous + 1;
}
