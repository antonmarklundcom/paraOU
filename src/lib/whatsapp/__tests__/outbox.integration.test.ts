import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db.js";
import { env } from "../../env.js";
import { handleInboundMessage, recordDeliveryStatus, sendWhatsappTemplate } from "../outbox.js";
import {
  confirmWhatsappVerification,
  disableWhatsapp,
  startWhatsappVerification,
} from "../verification.js";
import { eligibleChannels } from "../../alerts/channels.js";

/**
 * PHASE-F1 acceptance, against Postgres: delivery-state folding through the
 * webhook path, the consecutive-failure safety valve, STOP/BAJA opt-out, and
 * the OTP opt-in. No WhatsApp credentials in CI, so the dev transport is used —
 * no network calls, same convention as the email digest integration test.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

async function resetAll() {
  await prisma.whatsappMessage.deleteMany();
  await prisma.alertLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

async function seedUser(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      email: `wa-${Math.random().toString(36).slice(2)}@example.com`,
      plan: "BUSINESS",
      subscriptionStatus: "active",
      ...overrides,
    },
  });
}

/** A sent message with a provider id the webhook can land on. */
async function seedMessage(userId: string, providerMessageId: string) {
  return prisma.whatsappMessage.create({
    data: {
      userId,
      providerName: "twilio",
      providerMessageId,
      toPhone: "+595981123456",
      template: "digest",
      purpose: "digest",
      status: "SENT",
    },
  });
}

describe.skipIf(!hasDb)("whatsapp outbox + delivery state", () => {
  beforeAll(resetAll);
  beforeEach(resetAll);

  it("records an outbound message and its provider status", async () => {
    const user = await seedUser();
    const message = await sendWhatsappTemplate({
      userId: user.id,
      to: "+595981123456",
      template: "digest",
      variables: ["Constructora", "2", "Empedrado", "Cierra en 3 días", "https://x/panel"],
      purpose: "digest",
      itemCount: 2,
    });
    expect(message.providerName).toBe("dev"); // no credentials in CI
    expect(message.status).toBe("SENT");
    expect(message.itemCount).toBe(2);
  });

  it("folds webhook events monotonically and idempotently", async () => {
    const user = await seedUser();
    await seedMessage(user.id, "SM-order");

    await recordDeliveryStatus({ providerMessageId: "SM-order", status: "READ" });
    // A late `delivered` and a replayed `sent` must not regress the state.
    await recordDeliveryStatus({ providerMessageId: "SM-order", status: "DELIVERED" });
    await recordDeliveryStatus({ providerMessageId: "SM-order", status: "SENT" });

    const row = await prisma.whatsappMessage.findUniqueOrThrow({
      where: { providerMessageId: "SM-order" },
    });
    expect(row.status).toBe("READ");
  });

  it("acknowledges a status for a message it has never seen", async () => {
    expect(
      await recordDeliveryStatus({ providerMessageId: "SM-unknown", status: "DELIVERED" }),
    ).toBeNull();
  });

  it("marks the number FAILED after the configured consecutive failures and falls back to email", async () => {
    const user = await seedUser({
      whatsappPhone: "+595981123456",
      whatsappStatus: "VERIFIED",
      alertChannel: "EMAIL_AND_WHATSAPP",
    });
    for (let i = 0; i < env.WHATSAPP_MAX_DELIVERY_FAILURES; i++) {
      await seedMessage(user.id, `SM-fail-${i}`);
      await recordDeliveryStatus({
        providerMessageId: `SM-fail-${i}`,
        status: "FAILED",
        errorCode: "30008", // transient/unknown => one strike each
      });
    }
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappFailureCount).toBe(env.WHATSAPP_MAX_DELIVERY_FAILURES);
    expect(after.whatsappStatus).toBe("FAILED");
    expect(after.alertChannel).toBe("EMAIL");
    expect(eligibleChannels(after)).toEqual(["email"]);
  });

  it("does not double-count a replayed failure webhook", async () => {
    const user = await seedUser({ whatsappPhone: "+595981123456", whatsappStatus: "VERIFIED" });
    await seedMessage(user.id, "SM-dupe");
    await recordDeliveryStatus({
      providerMessageId: "SM-dupe",
      status: "FAILED",
      errorCode: "30008",
    });
    await recordDeliveryStatus({
      providerMessageId: "SM-dupe",
      status: "FAILED",
      errorCode: "30008",
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappFailureCount).toBe(1);
  });

  it("burns the whole budget on one permanently invalid number", async () => {
    const user = await seedUser({
      whatsappPhone: "+595981123456",
      whatsappStatus: "VERIFIED",
      alertChannel: "WHATSAPP",
    });
    await seedMessage(user.id, "SM-perm");
    await recordDeliveryStatus({
      providerMessageId: "SM-perm",
      status: "FAILED",
      errorCode: "63003",
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappStatus).toBe("FAILED");
    expect(after.alertChannel).toBe("EMAIL");
  });

  it("never penalizes the user for our own template misconfiguration", async () => {
    const user = await seedUser({ whatsappPhone: "+595981123456", whatsappStatus: "VERIFIED" });
    await seedMessage(user.id, "SM-ours");
    await recordDeliveryStatus({
      providerMessageId: "SM-ours",
      status: "FAILED",
      errorCode: "63016",
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappFailureCount).toBe(0);
    expect(after.whatsappStatus).toBe("VERIFIED");
  });

  it("clears the failure budget once a message is delivered again", async () => {
    const user = await seedUser({
      whatsappPhone: "+595981123456",
      whatsappStatus: "VERIFIED",
      whatsappFailureCount: 2,
    });
    await seedMessage(user.id, "SM-ok");
    await recordDeliveryStatus({ providerMessageId: "SM-ok", status: "DELIVERED" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappFailureCount).toBe(0);
  });
});

describe.skipIf(!hasDb)("whatsapp opt-out via inbound message", () => {
  beforeEach(resetAll);

  it("opts a user out on BAJA and falls back to email", async () => {
    const user = await seedUser({
      whatsappPhone: "+595981123456",
      whatsappStatus: "VERIFIED",
      alertChannel: "EMAIL_AND_WHATSAPP",
    });
    expect(await handleInboundMessage("+595981123456", "BAJA")).toBe("opted_out");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappStatus).toBe("OPTED_OUT");
    expect(after.alertChannel).toBe("EMAIL");
    expect(after.whatsappOptOutAt).not.toBeNull();
    expect(eligibleChannels(after)).toEqual(["email"]);
  });

  it("restores an opted-out number on ALTA", async () => {
    const user = await seedUser({
      whatsappPhone: "+595981123456",
      whatsappStatus: "OPTED_OUT",
      alertChannel: "EMAIL",
    });
    expect(await handleInboundMessage("+595981123456", "ALTA")).toBe("opted_in");
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappStatus).toBe("VERIFIED");
  });

  it("ignores chatter and unknown numbers", async () => {
    await seedUser({ whatsappPhone: "+595981123456", whatsappStatus: "VERIFIED" });
    expect(await handleInboundMessage("+595981123456", "hola, gracias!")).toBe("ignored");
    expect(await handleInboundMessage("+595999999999", "BAJA")).toBe("ignored");
  });
});

describe.skipIf(!hasDb)("whatsapp opt-in (OTP)", () => {
  beforeEach(resetAll);

  it("verifies a number end to end and normalizes it to E.164", async () => {
    const user = await seedUser();
    const started = await startWhatsappVerification(user.id, "0981 123 456");
    expect(started.devTransport).toBe(true); // no credentials in CI
    expect(started.maskedPhone).toBe("+595 ••• ••3456");

    const pending = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(pending.whatsappPhone).toBe("+595981123456");
    expect(pending.whatsappStatus).toBe("PENDING");
    // The code is only ever stored hashed.
    expect(pending.whatsappOtpHash).not.toBeNull();
    expect(pending.whatsappOtpHash).not.toBe(started.devCode);

    // A wrong code costs an attempt but keeps the verification alive…
    await expect(confirmWhatsappVerification(user.id, "000000")).rejects.toMatchObject({
      code: "INVALID_CODE",
    });
    const afterBadTry = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(afterBadTry.whatsappOtpAttempts).toBe(1);
    expect(afterBadTry.whatsappStatus).toBe("PENDING");

    // …and the right one completes the opt-in.
    await confirmWhatsappVerification(user.id, started.devCode!);
    const verified = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verified.whatsappStatus).toBe("VERIFIED");
    expect(verified.whatsappOtpHash).toBeNull();
    expect(verified.whatsappVerifiedAt).not.toBeNull();
    expect(eligibleChannels({ ...verified, alertChannel: "EMAIL_AND_WHATSAPP" })).toEqual([
      "email",
      "whatsapp",
    ]);
  });

  it("rejects an expired code", async () => {
    const user = await seedUser();
    const started = await startWhatsappVerification(user.id, "0981123456");
    await prisma.user.update({
      where: { id: user.id },
      data: { whatsappOtpExpiresAt: new Date(Date.now() - 1000) },
    });
    await expect(confirmWhatsappVerification(user.id, started.devCode!)).rejects.toMatchObject({
      code: "CODE_EXPIRED",
    });
  });

  it("rejects a WhatsApp opt-in on a plan that does not include the channel", async () => {
    const free = await seedUser({ plan: "FREE", subscriptionStatus: null });
    await expect(startWhatsappVerification(free.id, "0981123456")).rejects.toMatchObject({
      code: "PLAN_LIMIT",
    });
  });

  it("rejects an invalid phone number", async () => {
    const user = await seedUser();
    await expect(startWhatsappVerification(user.id, "021 123 456")).rejects.toMatchObject({
      code: "INVALID_PHONE",
    });
  });

  it("destroys the pending verification after too many attempts", async () => {
    const user = await seedUser();
    await startWhatsappVerification(user.id, "0981123456");
    for (let i = 1; i < env.WHATSAPP_OTP_MAX_ATTEMPTS; i++) {
      await expect(confirmWhatsappVerification(user.id, "000000")).rejects.toBeTruthy();
    }
    await expect(confirmWhatsappVerification(user.id, "000000")).rejects.toMatchObject({
      code: "TOO_MANY_ATTEMPTS",
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappOtpHash).toBeNull();
    expect(after.whatsappStatus).toBe("UNVERIFIED");
  });

  it("removing the number falls the channel back to email", async () => {
    const user = await seedUser({
      whatsappPhone: "+595981123456",
      whatsappStatus: "VERIFIED",
      alertChannel: "WHATSAPP",
    });
    await disableWhatsapp(user.id);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.whatsappPhone).toBeNull();
    expect(after.alertChannel).toBe("EMAIL");
    expect(eligibleChannels(after)).toEqual(["email"]);
  });
});
