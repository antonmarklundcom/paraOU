import { NextResponse } from "next/server";
import { handleStripeWebhook } from "@/lib/api/billing";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe webhook (PHASE-6 #2): checkout.session.completed,
 * customer.subscription.updated/deleted → User.plan. Signature-verified against
 * the raw request body (Stripe requires the exact bytes, not a re-serialized
 * JSON.parse'd object) — this route intentionally does NOT use the shared
 * `handle()`/`ok()` envelope, since Stripe expects a bare 200/4xx, not our
 * `{ ok, data }` wrapper.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe-signature header" }, { status: 400 });
  }
  const rawBody = await req.text();
  try {
    await handleStripeWebhook(rawBody, signature);
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Stripe webhook failed");
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
