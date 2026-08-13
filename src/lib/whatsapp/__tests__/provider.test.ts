import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  DevWhatsappProvider,
  mapTwilioStatus,
  TwilioWhatsappProvider,
  WhatsappSendError,
} from "../provider.js";
import { renderTemplate, WHATSAPP_TEMPLATES, variablesToNumberedMap } from "../templates.js";
import { InvalidPhoneError, maskPhone, normalizeInboundPhone, normalizePhone } from "../phone.js";

/**
 * PHASE-F1 #2: the provider abstraction. Tests use a fake `fetch` (same pattern
 * as the AI provider tests) — no network, no Twilio account.
 */

const CONFIG = {
  accountSid: "AC00000000000000000000000000000000",
  authToken: "test-auth-token",
  from: "+14155238886",
  apiBase: "https://api.twilio.test",
  statusCallbackUrl: "https://paraou.test/api/whatsapp/webhook",
};

function fakeFetch(body: unknown, okStatus = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: okStatus,
        headers: { "content-type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

/** Config as it looks once the owner's templates are approved. */
const APPROVED = { ...CONFIG, templateIds: { digest: "HX_digest" } } as const;

describe("normalizePhone", () => {
  it("accepts the ways a Paraguayan user actually types their number", () => {
    expect(normalizePhone("0981 123 456")).toBe("+595981123456");
    expect(normalizePhone("981123456")).toBe("+595981123456");
    expect(normalizePhone("(0985) 123-456")).toBe("+595985123456");
    expect(normalizePhone("+595 981 123456")).toBe("+595981123456");
    expect(normalizePhone("00595981123456")).toBe("+595981123456");
  });

  it("rejects non-mobile and malformed local input", () => {
    expect(() => normalizePhone("021 123 456")).toThrow(InvalidPhoneError);
    expect(() => normalizePhone("")).toThrow(InvalidPhoneError);
    expect(() => normalizePhone("abc")).toThrow(InvalidPhoneError);
  });

  it("normalizes provider-shaped inbound numbers and masks for display", () => {
    expect(normalizeInboundPhone("whatsapp:+595981123456")).toBe("+595981123456");
    expect(normalizeInboundPhone("nope")).toBeNull();
    expect(maskPhone("+595981123456")).toBe("+595 ••• ••3456");
  });
});

describe("templates", () => {
  it("renders the approved body locally for the dev transport", () => {
    const text = renderTemplate("verification", ["123456", "10"]);
    expect(text).toContain("123456");
    expect(text).toContain("10 minutos");
  });

  it("maps ordered variables to the provider's numbered format", () => {
    expect(variablesToNumberedMap(["a", "b"])).toEqual({ "1": "a", "2": "b" });
  });

  it("declares a variable name for every placeholder in each body", () => {
    for (const def of Object.values(WHATSAPP_TEMPLATES)) {
      const placeholders = new Set([...def.body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]));
      expect(placeholders.size).toBe(def.variables.length);
    }
  });
});

describe("TwilioWhatsappProvider.sendTemplate", () => {
  it("posts the approved template id and numbered variables", async () => {
    const fetchFn = fakeFetch({ sid: "SM123", status: "queued" });
    const provider = new TwilioWhatsappProvider(APPROVED, fetchFn);
    const result = await provider.sendTemplate({
      to: "+595981123456",
      template: "digest",
      variables: [
        "Constructora",
        "3",
        "Empedrado",
        "Cierra en 5 días",
        "https://paraou.test/panel",
      ],
    });

    expect(result).toEqual({ provider: "twilio", providerMessageId: "SM123", status: "QUEUED" });
    const [url, init] = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(`${CONFIG.apiBase}/2010-04-01/Accounts/${CONFIG.accountSid}/Messages.json`);
    const body = new URLSearchParams(init.body as string);
    expect(body.get("To")).toBe("whatsapp:+595981123456");
    expect(body.get("From")).toBe("whatsapp:+14155238886");
    expect(body.get("ContentSid")).toBe("HX_digest");
    expect(JSON.parse(body.get("ContentVariables")!)["2"]).toBe("3");
    expect(body.get("StatusCallback")).toBe(CONFIG.statusCallbackUrl);
  });

  it("refuses to send a template with no approved id configured", async () => {
    const provider = new TwilioWhatsappProvider(CONFIG, fakeFetch({}));
    await expect(
      provider.sendTemplate({ to: "+595981123456", template: "deadline", variables: [] }),
    ).rejects.toBeInstanceOf(WhatsappSendError);
  });

  it("surfaces the provider error code on a non-2xx response", async () => {
    const provider = new TwilioWhatsappProvider(
      APPROVED,
      fakeFetch({ code: 63003, message: "Recipient not found" }, 400),
    );
    await expect(
      provider.sendTemplate({ to: "+595981123456", template: "digest", variables: [] }),
    ).rejects.toMatchObject({ errorCode: "63003" });
  });
});

describe("mapTwilioStatus", () => {
  it("maps every documented Twilio status", () => {
    expect(mapTwilioStatus("accepted")).toBe("QUEUED");
    expect(mapTwilioStatus("sending")).toBe("QUEUED");
    expect(mapTwilioStatus("sent")).toBe("SENT");
    expect(mapTwilioStatus("delivered")).toBe("DELIVERED");
    expect(mapTwilioStatus("read")).toBe("READ");
    expect(mapTwilioStatus("undelivered")).toBe("UNDELIVERED");
    expect(mapTwilioStatus("failed")).toBe("FAILED");
    expect(mapTwilioStatus("something-new")).toBe("QUEUED");
  });
});

describe("TwilioWhatsappProvider webhook verification", () => {
  const provider = new TwilioWhatsappProvider(CONFIG, fakeFetch({}));

  function sign(body: string, url = CONFIG.statusCallbackUrl): string {
    const params = new URLSearchParams(body);
    const keys = [...new Set(params.keys())].sort();
    let payload = url;
    for (const k of keys) payload += k + (params.get(k) ?? "");
    return createHmac("sha1", CONFIG.authToken).update(payload, "utf8").digest("base64");
  }

  const statusBody = "MessageSid=SM123&MessageStatus=delivered&ErrorCode=";

  it("accepts a correctly signed payload", () => {
    const headers = new Headers({ "x-twilio-signature": sign(statusBody) });
    expect(
      provider.verifyWebhook({ rawBody: statusBody, headers, url: CONFIG.statusCallbackUrl }),
    ).toBe(true);
  });

  it("rejects a tampered body, a wrong signature, and a missing header", () => {
    const good = sign(statusBody);
    const tampered = "MessageSid=SM123&MessageStatus=failed&ErrorCode=";
    expect(
      provider.verifyWebhook({
        rawBody: tampered,
        headers: new Headers({ "x-twilio-signature": good }),
        url: CONFIG.statusCallbackUrl,
      }),
    ).toBe(false);
    expect(
      provider.verifyWebhook({
        rawBody: statusBody,
        headers: new Headers({ "x-twilio-signature": "bm90LWEtc2ln" }),
        url: CONFIG.statusCallbackUrl,
      }),
    ).toBe(false);
    expect(
      provider.verifyWebhook({
        rawBody: statusBody,
        headers: new Headers(),
        url: CONFIG.statusCallbackUrl,
      }),
    ).toBe(false);
  });
});

describe("TwilioWhatsappProvider.parseWebhook", () => {
  const provider = new TwilioWhatsappProvider(CONFIG, fakeFetch({}));

  it("parses a status callback", () => {
    expect(
      provider.parseWebhook(
        "MessageSid=SM9&MessageStatus=failed&ErrorCode=63003&ErrorMessage=nope",
      ),
    ).toEqual([
      {
        kind: "status",
        providerMessageId: "SM9",
        status: "FAILED",
        errorCode: "63003",
        errorMessage: "nope",
      },
    ]);
  });

  it("parses an inbound message (the STOP/BAJA path)", () => {
    expect(provider.parseWebhook("From=whatsapp%3A%2B595981123456&Body=BAJA")).toEqual([
      { kind: "inbound", fromPhone: "+595981123456", body: "BAJA" },
    ]);
  });

  it("ignores payloads it cannot interpret", () => {
    expect(provider.parseWebhook("AccountSid=AC1")).toEqual([]);
  });
});

describe("DevWhatsappProvider", () => {
  it("logs instead of sending and never claims a verifiable webhook", async () => {
    const provider = new DevWhatsappProvider();
    const result = await provider.sendTemplate({
      to: "+595981123456",
      template: "verification",
      variables: ["123456", "10"],
    });
    expect(result).toEqual({ provider: "dev", providerMessageId: null, status: "SENT" });
    expect(provider.live).toBe(false);
    expect(provider.verifyWebhook()).toBe(false);
    expect(provider.parseWebhook()).toEqual([]);
  });
});
