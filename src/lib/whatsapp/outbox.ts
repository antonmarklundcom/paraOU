import type { WhatsappDeliveryStatus, WhatsappMessage } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { channelWithoutWhatsapp } from "../alerts/channels.js";
import {
  classifyFailure,
  countsAsFailure,
  countsAsSuccess,
  nextDeliveryStatus,
  nextFailureCount,
} from "./deliveryState.js";
import { getWhatsappProvider, WhatsappSendError, type FetchFn } from "./provider.js";
import { maskPhone } from "./phone.js";
import type { WhatsappTemplateKey } from "./templates.js";

/**
 * The WhatsApp outbox (PHASE-F1 #3): every outbound message is a row, written
 * *before* the provider call, so a crash mid-send leaves a QUEUED record rather
 * than a silent hole, and the async status webhook always has a row to land on.
 *
 * This module owns the two-way relationship between a message's delivery state
 * and the user's channel health:
 *   send → QUEUED → (webhook) SENT → DELIVERED → READ
 *                 ↘ FAILED / UNDELIVERED → consecutive-failure budget → status FAILED
 */

export type WhatsappPurpose = "digest" | "deadline" | "verification";

export interface SendWhatsappInput {
  userId: string;
  to: string;
  template: WhatsappTemplateKey;
  variables: string[];
  purpose: WhatsappPurpose;
  itemCount?: number;
  /** Test seam — forwarded to the provider. */
  fetchFn?: FetchFn;
}

/**
 * Sends one template message and records it. Throws on provider failure (the
 * caller decides whether that aborts a digest run) but never leaves the outbox
 * or the user's channel health inconsistent.
 */
export async function sendWhatsappTemplate(input: SendWhatsappInput): Promise<WhatsappMessage> {
  const provider = getWhatsappProvider(input.fetchFn);
  const row = await prisma.whatsappMessage.create({
    data: {
      userId: input.userId,
      providerName: provider.name,
      toPhone: input.to,
      template: input.template,
      purpose: input.purpose,
      itemCount: input.itemCount ?? 0,
      status: "QUEUED",
    },
  });

  try {
    const result = await provider.sendTemplate({
      to: input.to,
      template: input.template,
      variables: input.variables,
    });
    const updated = await prisma.whatsappMessage.update({
      where: { id: row.id },
      data: {
        providerMessageId: result.providerMessageId,
        status: result.status,
        statusUpdatedAt: new Date(),
      },
    });
    logger.info(
      {
        userId: input.userId,
        to: maskPhone(input.to),
        template: input.template,
        provider: provider.name,
        status: result.status,
      },
      "whatsapp message accepted by provider",
    );
    return updated;
  } catch (err) {
    const code = err instanceof WhatsappSendError ? err.errorCode : null;
    const message = err instanceof Error ? err.message : String(err);
    await prisma.whatsappMessage.update({
      where: { id: row.id },
      data: {
        status: "FAILED",
        errorCode: code,
        errorMessage: message.slice(0, 500),
        statusUpdatedAt: new Date(),
      },
    });
    // A synchronous rejection is as much evidence about the number as an async
    // failure webhook — run it through the same health accounting.
    await applyFailureToUser(input.userId, code);
    logger.error(
      { userId: input.userId, to: maskPhone(input.to), errorCode: code, err: message },
      "whatsapp send failed",
    );
    throw err;
  }
}

/**
 * Folds a provider status callback into the stored message and the user's
 * channel health. Idempotent: replayed webhooks (providers retry until 2xx)
 * converge on the same state and never double-count a failure.
 */
export async function recordDeliveryStatus(input: {
  providerMessageId: string;
  status: WhatsappDeliveryStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<{ applied: boolean; status: WhatsappDeliveryStatus } | null> {
  const row = await prisma.whatsappMessage.findUnique({
    where: { providerMessageId: input.providerMessageId },
  });
  if (!row) {
    // A callback for a message we have no record of — a stale send from another
    // environment sharing the sender number. Log and acknowledge, never 500.
    logger.warn(
      { providerMessageId: input.providerMessageId },
      "whatsapp status for unknown message",
    );
    return null;
  }

  const next = nextDeliveryStatus(row.status, input.status);
  const failed = countsAsFailure(row.status, next);
  const succeeded = countsAsSuccess(row.status, next);

  if (next !== row.status || input.errorCode) {
    await prisma.whatsappMessage.update({
      where: { id: row.id },
      data: {
        status: next,
        errorCode: input.errorCode ?? row.errorCode,
        errorMessage: input.errorMessage?.slice(0, 500) ?? row.errorMessage,
        statusUpdatedAt: new Date(),
      },
    });
  }

  if (failed) await applyFailureToUser(row.userId, input.errorCode ?? null);
  if (succeeded) await applySuccessToUser(row.userId);

  return { applied: next !== row.status, status: next };
}

/**
 * Consecutive-failure accounting. At WHATSAPP_MAX_DELIVERY_FAILURES the number
 * is marked FAILED and the channel preference falls back to email — the
 * "should not keep getting retried forever" requirement (PHASE-F1 #3).
 */
async function applyFailureToUser(userId: string, errorCode: string | null): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { whatsappFailureCount: true, whatsappStatus: true, alertChannel: true },
  });
  if (!user) return;

  const kind = classifyFailure(errorCode);
  const max = env.WHATSAPP_MAX_DELIVERY_FAILURES;
  const count = nextFailureCount(user.whatsappFailureCount, kind, max);
  if (count === user.whatsappFailureCount) return; // sender-side error: not the user's fault

  const exhausted = count >= max && user.whatsappStatus !== "OPTED_OUT";
  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappFailureCount: count,
      ...(exhausted
        ? {
            whatsappStatus: "FAILED",
            alertChannel: channelWithoutWhatsapp(user.alertChannel),
          }
        : {}),
    },
  });
  if (exhausted) {
    logger.warn(
      { userId, failures: count, errorCode },
      "whatsapp number marked FAILED; falling back to email",
    );
  }
}

/** A confirmed delivery clears the failure budget — the number works again. */
async function applySuccessToUser(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, whatsappFailureCount: { gt: 0 } },
    data: { whatsappFailureCount: 0 },
  });
}

/**
 * Inbound-message handling. WhatsApp users expect STOP-style keywords to work;
 * in Paraguay they will type BAJA or CANCELAR long before STOP, so all of them
 * opt the number out immediately. START/ALTA re-enables a number that is still
 * on file (a reply on WhatsApp is itself valid re-consent).
 */
const STOP_WORDS = new Set([
  "stop",
  "baja",
  "cancelar",
  "cancel",
  "salir",
  "parar",
  "basta",
  "unsubscribe",
  "desuscribir",
]);
const START_WORDS = new Set(["start", "alta", "iniciar", "suscribir", "si", "sí"]);

export type InboundOutcome = "opted_out" | "opted_in" | "ignored";

export async function handleInboundMessage(
  fromPhone: string,
  body: string,
): Promise<InboundOutcome> {
  const word = body
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}]/gu, "");
  const user = await prisma.user.findFirst({
    where: { whatsappPhone: fromPhone },
    select: { id: true, alertChannel: true, whatsappStatus: true },
  });
  if (!user) return "ignored";

  if (STOP_WORDS.has(word)) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        whatsappStatus: "OPTED_OUT",
        whatsappOptOutAt: new Date(),
        whatsappOtpHash: null,
        whatsappOtpExpiresAt: null,
        alertChannel: channelWithoutWhatsapp(user.alertChannel),
      },
    });
    logger.info({ userId: user.id }, "whatsapp opt-out via inbound keyword");
    return "opted_out";
  }

  if (START_WORDS.has(word) && user.whatsappStatus === "OPTED_OUT") {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        whatsappStatus: "VERIFIED",
        whatsappOptOutAt: null,
        whatsappVerifiedAt: new Date(),
        whatsappFailureCount: 0,
      },
    });
    logger.info({ userId: user.id }, "whatsapp opt-in restored via inbound keyword");
    return "opted_in";
  }

  return "ignored";
}
