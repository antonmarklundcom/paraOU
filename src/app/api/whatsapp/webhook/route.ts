import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { env, whatsappConfigured } from "@/lib/env";
import { getWhatsappProvider } from "@/lib/whatsapp/provider";
import { handleInboundMessage, recordDeliveryStatus } from "@/lib/whatsapp/outbox";

/**
 * WhatsApp provider webhook (PHASE-F1 #3) — the async half of delivery.
 *
 * Two kinds of callback arrive here:
 *   - **status callbacks** (queued → sent → delivered → read → failed) for
 *     messages we sent, folded into WhatsappMessage by the delivery state
 *     machine and into the user's channel health (consecutive failures → the
 *     number stops being retried);
 *   - **inbound messages**, which is how a user says STOP/BAJA.
 *
 * Signature-verified against the raw body before anything is parsed, mirroring
 * `/api/billing/webhook`'s Stripe verification: the exact bytes matter, so this
 * route reads `req.text()` and does NOT use the shared `handle()`/`ok()`
 * envelope — providers expect a bare 2xx and retry anything else.
 *
 * Configure the URL at the provider (see docs/09-whatsapp.md); when no
 * credentials are set the route refuses everything, because an unverifiable
 * webhook is an unauthenticated write to user state.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  if (!whatsappConfigured()) {
    return NextResponse.json({ error: "whatsapp provider not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const provider = getWhatsappProvider();
  const url = env.WHATSAPP_WEBHOOK_URL ?? req.url;

  if (!provider.verifyWebhook({ rawBody, headers: req.headers, url })) {
    logger.warn({ url }, "whatsapp webhook signature rejected");
    return NextResponse.json({ error: "invalid signature" }, { status: 403 });
  }

  try {
    const events = provider.parseWebhook(rawBody);
    for (const event of events) {
      if (event.kind === "status") {
        await recordDeliveryStatus({
          providerMessageId: event.providerMessageId,
          status: event.status,
          errorCode: event.errorCode,
          errorMessage: event.errorMessage,
        });
      } else {
        await handleInboundMessage(event.fromPhone, event.body);
      }
    }
    // Always 200 once the signature checked out: providers retry non-2xx, and a
    // replayed status event is harmless (the state machine is idempotent) but a
    // replayed *inbound* one is noise we don't need.
    return NextResponse.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "whatsapp webhook processing failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
