import { z } from "zod";
import { auth } from "@/lib/auth";
import { ApiError, handle, ok } from "@/lib/api/http";
import { whatsappSettings } from "@/lib/api/account";
import { enforcePublicRateLimit } from "@/lib/api/rateLimit";
import {
  confirmWhatsappVerification,
  disableWhatsapp,
  startWhatsappVerification,
} from "@/lib/whatsapp/verification";

/**
 * WhatsApp opt-in for alerts (PHASE-F1 #5).
 *
 *   POST   { phone }  → send an OTP over the authentication template (PENDING)
 *   PUT    { code }   → confirm it (VERIFIED — the only deliverable state)
 *   DELETE            → remove the number and fall back to email
 *
 * Plan gating (Business+) lives in `startWhatsappVerification` via
 * `src/lib/plan.ts` — never re-implemented here.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startSchema = z.object({ phone: z.string().min(6).max(24) });
const confirmSchema = z.object({ code: z.string().min(4).max(10) });

async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return session.user.id;
}

export const GET = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  return ok(await whatsappSettings(userId));
});

export const POST = handle(async (req) => {
  // OTPs cost a real WhatsApp conversation each — the shared per-IP limiter is
  // the cheap first line of defence; the per-user attempt ceiling is the second.
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const { phone } = startSchema.parse(await req.json());
  const result = await startWhatsappVerification(userId, phone);
  return ok({
    maskedPhone: result.maskedPhone,
    expiresAt: result.expiresAt.toISOString(),
    devTransport: result.devTransport,
  });
});

export const PUT = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  const { code } = confirmSchema.parse(await req.json());
  await confirmWhatsappVerification(userId, code);
  return ok(await whatsappSettings(userId));
});

export const DELETE = handle(async (req) => {
  enforcePublicRateLimit(req);
  const userId = await requireUserId();
  await disableWhatsapp(userId);
  return ok(await whatsappSettings(userId));
});
