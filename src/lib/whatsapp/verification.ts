import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { ApiError } from "../api/http.js";
import { channelWithoutWhatsapp, whatsappAllowedByPlan } from "../alerts/channels.js";
import { normalizePhone, InvalidPhoneError, maskPhone } from "./phone.js";
import { sendWhatsappTemplate } from "./outbox.js";
import type { FetchFn } from "./provider.js";

/**
 * WhatsApp opt-in (PHASE-F1 #5): a one-time code delivered over the
 * authentication template. Deliberately small — proving the user controls the
 * number and consents to be messaged there, nothing more.
 *
 * The code is never stored in the clear: only an HMAC keyed by AUTH_SECRET,
 * compared in constant time, with an expiry and an attempt ceiling.
 */

const CODE_LENGTH = 6;

function hashCode(code: string, userId: string): string {
  // AUTH_SECRET is optional in dev (see env.ts); the fallback keeps local runs
  // working while production always has a real pepper.
  const key = env.AUTH_SECRET ?? "paraou-dev-otp-pepper";
  return createHmac("sha256", key).update(`${userId}:${code}`).digest("hex");
}

function codesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export interface StartVerificationResult {
  phone: string;
  maskedPhone: string;
  expiresAt: Date;
  /** True when no provider credentials exist and the code was only logged. */
  devTransport: boolean;
  /**
   * The plaintext code — populated ONLY under the dev transport, where it was
   * just written to the server log anyway, so local dev and tests have a usable
   * happy path. The API route never returns it; with real credentials it is
   * always null.
   */
  devCode: string | null;
}

/**
 * Sends an opt-in code to `rawPhone` and parks the user in PENDING. Re-running
 * it replaces the previous code (users mistype numbers), and switching numbers
 * always invalidates any earlier verification.
 */
export async function startWhatsappVerification(
  userId: string,
  rawPhone: string,
  fetchFn?: FetchFn,
): Promise<StartVerificationResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!whatsappAllowedByPlan(user)) {
    throw new ApiError(
      403,
      "PLAN_LIMIT",
      "Las alertas por WhatsApp son del plan Business — actualizá en /precios",
    );
  }

  let phone: string;
  try {
    phone = normalizePhone(rawPhone);
  } catch (err) {
    if (err instanceof InvalidPhoneError) {
      throw new ApiError(400, "INVALID_PHONE", err.message);
    }
    throw err;
  }

  const code = String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
  const expiresAt = new Date(Date.now() + env.WHATSAPP_OTP_TTL_MINUTES * 60_000);

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappPhone: phone,
      whatsappStatus: "PENDING",
      whatsappOtpHash: hashCode(code, userId),
      whatsappOtpExpiresAt: expiresAt,
      whatsappOtpAttempts: 0,
      whatsappFailureCount: 0,
      whatsappOptOutAt: null,
      whatsappVerifiedAt: null,
    },
  });

  const message = await sendWhatsappTemplate({
    userId,
    to: phone,
    template: "verification",
    variables: [code, String(env.WHATSAPP_OTP_TTL_MINUTES)],
    purpose: "verification",
    fetchFn,
  });

  const devTransport = message.providerName === "dev";
  return {
    phone,
    maskedPhone: maskPhone(phone),
    expiresAt,
    devTransport,
    devCode: devTransport ? code : null,
  };
}

/**
 * Confirms the code. On success the number becomes a deliverable channel; on
 * too many wrong attempts the pending verification is destroyed (the user must
 * request a fresh code) so the code space can't be walked.
 */
export async function confirmWhatsappVerification(userId: string, code: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.whatsappPhone || !user.whatsappOtpHash || !user.whatsappOtpExpiresAt) {
    throw new ApiError(400, "NO_PENDING_VERIFICATION", "Pedí un código nuevo antes de verificar");
  }
  if (user.whatsappOtpExpiresAt.getTime() < Date.now()) {
    await clearOtp(userId);
    throw new ApiError(400, "CODE_EXPIRED", "El código venció — pedí uno nuevo");
  }
  if (user.whatsappOtpAttempts >= env.WHATSAPP_OTP_MAX_ATTEMPTS) {
    await clearOtp(userId);
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Demasiados intentos — pedí un código nuevo");
  }

  if (!codesMatch(hashCode(code.trim(), userId), user.whatsappOtpHash)) {
    const attempts = user.whatsappOtpAttempts + 1;
    if (attempts >= env.WHATSAPP_OTP_MAX_ATTEMPTS) {
      await clearOtp(userId);
      throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Demasiados intentos — pedí un código nuevo");
    }
    await prisma.user.update({ where: { id: userId }, data: { whatsappOtpAttempts: attempts } });
    throw new ApiError(400, "INVALID_CODE", "Código incorrecto");
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappStatus: "VERIFIED",
      whatsappVerifiedAt: new Date(),
      whatsappOtpHash: null,
      whatsappOtpExpiresAt: null,
      whatsappOtpAttempts: 0,
      whatsappFailureCount: 0,
    },
  });
}

/**
 * The user removing their number from /cuenta. Treated as an explicit opt-out
 * (not just "unverified") so a later re-add is a deliberate re-consent, and the
 * alert channel falls back to email rather than going silent.
 */
export async function disableWhatsapp(userId: string): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappPhone: null,
      whatsappStatus: "UNVERIFIED",
      whatsappOtpHash: null,
      whatsappOtpExpiresAt: null,
      whatsappOtpAttempts: 0,
      whatsappFailureCount: 0,
      whatsappVerifiedAt: null,
      whatsappOptOutAt: new Date(),
      alertChannel: channelWithoutWhatsapp(user.alertChannel),
    },
  });
}

async function clearOtp(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      whatsappOtpHash: null,
      whatsappOtpExpiresAt: null,
      whatsappOtpAttempts: 0,
      whatsappStatus: "UNVERIFIED",
    },
  });
}
