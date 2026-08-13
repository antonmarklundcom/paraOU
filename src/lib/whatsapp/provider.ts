import { createHmac, timingSafeEqual } from "node:crypto";
import type { WhatsappDeliveryStatus } from "@prisma/client";
import { env, whatsappConfigured } from "../env.js";
import { logger } from "../log.js";
import {
  renderTemplate,
  templateProviderId,
  variablesToNumberedMap,
  WHATSAPP_TEMPLATES,
  type WhatsappTemplateKey,
} from "./templates.js";
import { normalizeInboundPhone } from "./phone.js";

/**
 * WhatsApp provider abstraction (PHASE-F1 #2) — the same shape as
 * `src/lib/ai/provider.ts`: one interface, one default real implementation
 * (Twilio's WhatsApp Business API), an alternative kept honest as an explicit
 * not-implemented stub (360dialog), and a dev transport that logs instead of
 * sending when no credentials exist (mirrors `src/lib/email.ts`).
 *
 * Nothing outside `src/lib/whatsapp/` may talk to a messaging API directly.
 */

export type FetchFn = typeof fetch;

export interface WhatsappSendInput {
  /** Destination in E.164 (no `whatsapp:` prefix — that is transport-specific). */
  to: string;
  template: WhatsappTemplateKey;
  /** Ordered values for the template's {{1}}…{{n}} placeholders. */
  variables: string[];
}

export interface WhatsappSendResult {
  provider: string;
  /** Provider message id (Twilio MessageSid). Null only for the dev transport. */
  providerMessageId: string | null;
  status: WhatsappDeliveryStatus;
}

/** A normalized event parsed out of a provider webhook payload. */
export type WhatsappWebhookEvent =
  | {
      kind: "status";
      providerMessageId: string;
      status: WhatsappDeliveryStatus;
      errorCode: string | null;
      errorMessage: string | null;
    }
  | { kind: "inbound"; fromPhone: string; body: string };

export interface WhatsappWebhookRequest {
  rawBody: string;
  headers: Headers;
  /** The URL the provider called (signature input for Twilio). */
  url: string;
}

export interface WhatsappProvider {
  readonly name: string;
  /** True when this provider could actually reach the network. */
  readonly live: boolean;
  sendTemplate(input: WhatsappSendInput): Promise<WhatsappSendResult>;
  /** Verifies the webhook signature. False => reject the request with 403. */
  verifyWebhook(req: WhatsappWebhookRequest): boolean;
  parseWebhook(rawBody: string): WhatsappWebhookEvent[];
}

export class WhatsappSendError extends Error {
  constructor(
    message: string,
    readonly errorCode: string | null = null,
  ) {
    super(message);
    this.name = "WhatsappSendError";
  }
}

// ── Twilio ────────────────────────────────────────────────────────────

/** Twilio message statuses → our enum. Anything unknown parks at QUEUED. */
export function mapTwilioStatus(raw: string): WhatsappDeliveryStatus {
  switch (raw.toLowerCase()) {
    case "accepted":
    case "scheduled":
    case "queued":
    case "sending":
      return "QUEUED";
    case "sent":
      return "SENT";
    case "delivered":
      return "DELIVERED";
    case "read":
      return "READ";
    case "undelivered":
      return "UNDELIVERED";
    case "failed":
      return "FAILED";
    default:
      return "QUEUED";
  }
}

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  /** WhatsApp sender in E.164. */
  from: string;
  apiBase?: string;
  /** Public URL of our webhook — Twilio's StatusCallback and signature input. */
  statusCallbackUrl?: string | null;
  /**
   * Approved template ids, overriding the WHATSAPP_TEMPLATE_*_ID env values.
   * Production leaves this unset (env is the source of truth); tests use it to
   * exercise both the configured and the not-yet-approved paths.
   */
  templateIds?: Partial<Record<WhatsappTemplateKey, string>>;
}

/**
 * Twilio WhatsApp Business API over plain `fetch` (no SDK — same choice as
 * `src/lib/ai/gemini.ts`: one less dependency, and the surface we use is two
 * endpoints and an HMAC).
 */
export class TwilioWhatsappProvider implements WhatsappProvider {
  readonly name = "twilio";
  readonly live = true;

  constructor(
    private readonly config: TwilioConfig,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async sendTemplate(input: WhatsappSendInput): Promise<WhatsappSendResult> {
    const contentSid =
      this.config.templateIds?.[input.template] ?? templateProviderId(input.template);
    if (!contentSid) {
      throw new WhatsappSendError(
        `No approved template id configured for "${input.template}" — set the matching WHATSAPP_TEMPLATE_*_ID (see docs/09-whatsapp.md)`,
        "63016",
      );
    }

    const body = new URLSearchParams({
      To: `whatsapp:${input.to}`,
      From: `whatsapp:${this.config.from}`,
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(variablesToNumberedMap(input.variables)),
    });
    if (this.config.statusCallbackUrl) {
      body.set("StatusCallback", this.config.statusCallbackUrl);
    }

    const base = this.config.apiBase ?? env.TWILIO_API_BASE;
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString(
      "base64",
    );
    const res = await this.fetchFn(
      `${base}/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    const json = (await res.json().catch(() => ({}))) as {
      sid?: string;
      status?: string;
      code?: number | string;
      message?: string;
    };
    if (!res.ok) {
      throw new WhatsappSendError(
        json.message ?? `Twilio responded ${res.status}`,
        json.code === undefined ? null : String(json.code),
      );
    }
    return {
      provider: this.name,
      providerMessageId: json.sid ?? null,
      status: mapTwilioStatus(json.status ?? "queued"),
    };
  }

  /**
   * Twilio's X-Twilio-Signature: base64(HMAC-SHA1(authToken, url + concat of
   * POST params sorted by key)). Compared in constant time, exactly like the
   * Stripe webhook route's `constructEvent` does for its own scheme.
   */
  verifyWebhook(req: WhatsappWebhookRequest): boolean {
    const signature = req.headers.get("x-twilio-signature");
    if (!signature) return false;

    const url = this.config.statusCallbackUrl ?? req.url;
    const params = new URLSearchParams(req.rawBody);
    const keys = [...new Set(params.keys())].sort();
    let payload = url;
    for (const key of keys) payload += key + (params.get(key) ?? "");

    const expected = createHmac("sha1", this.config.authToken).update(payload, "utf8").digest();
    let provided: Buffer;
    try {
      provided = Buffer.from(signature, "base64");
    } catch {
      return false;
    }
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  }

  parseWebhook(rawBody: string): WhatsappWebhookEvent[] {
    const p = new URLSearchParams(rawBody);
    const sid = p.get("MessageSid") ?? p.get("SmsSid");

    // Status callback: carries MessageStatus for a message we sent.
    const status = p.get("MessageStatus") ?? p.get("SmsStatus");
    if (sid && status) {
      return [
        {
          kind: "status",
          providerMessageId: sid,
          status: mapTwilioStatus(status),
          errorCode: p.get("ErrorCode"),
          errorMessage: p.get("ErrorMessage"),
        },
      ];
    }

    // Inbound message: the user wrote to us (STOP/BAJA handling, PHASE-F1 #3).
    const from = p.get("From");
    if (from) {
      const phone = normalizeInboundPhone(from);
      if (phone) return [{ kind: "inbound", fromPhone: phone, body: p.get("Body") ?? "" }];
    }
    return [];
  }
}

// ── 360dialog (documented alternative, not implemented) ────────────────

class Dialog360Provider implements WhatsappProvider {
  readonly name = "dialog360";
  readonly live = true;
  private fail(): never {
    throw new Error(
      "WHATSAPP_PROVIDER=dialog360 is not implemented in this build — Twilio is the default provider (PHASE-F1, docs/09-whatsapp.md). Set WHATSAPP_PROVIDER=twilio or implement Dialog360Provider in src/lib/whatsapp/provider.ts.",
    );
  }
  sendTemplate(): Promise<WhatsappSendResult> {
    this.fail();
  }
  verifyWebhook(): boolean {
    this.fail();
  }
  parseWebhook(): WhatsappWebhookEvent[] {
    this.fail();
  }
}

// ── Dev transport ──────────────────────────────────────────────────────

/**
 * Logs the rendered template instead of sending — the WhatsApp equivalent of
 * `sendEmail`'s console transport. Used whenever the active provider has no
 * credentials, so the entire opt-in + digest flow is exercisable (and testable,
 * and demo-able) with no Twilio account. It reports SENT rather than QUEUED so
 * local runs settle in a state a real message would only reach via webhook.
 */
export class DevWhatsappProvider implements WhatsappProvider {
  readonly name = "dev";
  readonly live = false;

  async sendTemplate(input: WhatsappSendInput): Promise<WhatsappSendResult> {
    logger.info(
      {
        to: input.to,
        template: WHATSAPP_TEMPLATES[input.template].name,
        preview: renderTemplate(input.template, input.variables),
      },
      "[dev whatsapp transport] would send",
    );
    return { provider: this.name, providerMessageId: null, status: "SENT" };
  }

  /** No credentials => no signature to verify; the route rejects instead. */
  verifyWebhook(): boolean {
    return false;
  }

  parseWebhook(): WhatsappWebhookEvent[] {
    return [];
  }
}

// ── Selection ──────────────────────────────────────────────────────────

let cached: WhatsappProvider | undefined;

function build(fetchFn?: FetchFn): WhatsappProvider {
  if (!whatsappConfigured()) return new DevWhatsappProvider();
  if (env.WHATSAPP_PROVIDER === "dialog360") return new Dialog360Provider();
  return new TwilioWhatsappProvider(
    {
      accountSid: env.TWILIO_ACCOUNT_SID!,
      authToken: env.TWILIO_AUTH_TOKEN!,
      from: env.TWILIO_WHATSAPP_FROM!,
      apiBase: env.TWILIO_API_BASE,
      statusCallbackUrl: env.WHATSAPP_WEBHOOK_URL ?? null,
    },
    fetchFn,
  );
}

/** The configured provider. `fetchFn` override is for tests. */
export function getWhatsappProvider(fetchFn?: FetchFn): WhatsappProvider {
  if (fetchFn) return build(fetchFn);
  cached ??= build();
  return cached;
}

/** Test seam: forget the memoized provider after changing env. */
export function resetWhatsappProviderCache(): void {
  cached = undefined;
}
