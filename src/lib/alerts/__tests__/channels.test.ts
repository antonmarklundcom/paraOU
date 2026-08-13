import { describe, expect, it } from "vitest";
import {
  channelWithoutWhatsapp,
  eligibleChannels,
  requestedChannels,
  whatsappAllowedByPlan,
  type ChannelEligibilityUser,
} from "../channels.js";
import { buildWhatsappDigest, truncateForWhatsapp } from "../whatsappDigest.js";
import type { DigestItem } from "../DigestEmail.js";

/**
 * PHASE-F1 #1/#4: channel selection is the one place that decides who receives
 * an alert where. Every reason a channel can be withheld — plan gating, a
 * bounced address, an unverified/failed/opted-out number — is asserted here.
 */

const base: ChannelEligibilityUser = {
  alertChannel: "EMAIL_AND_WHATSAPP",
  emailBounced: false,
  plan: "BUSINESS",
  manualBilling: false,
  subscriptionStatus: "active",
  whatsappPhone: "+595981123456",
  whatsappStatus: "VERIFIED",
};

describe("requestedChannels", () => {
  it("expands every AlertChannel value", () => {
    expect(requestedChannels("EMAIL")).toEqual(["email"]);
    expect(requestedChannels("WHATSAPP")).toEqual(["whatsapp"]);
    expect(requestedChannels("EMAIL_AND_WHATSAPP")).toEqual(["email", "whatsapp"]);
    expect(requestedChannels("NONE")).toEqual([]);
  });
});

describe("eligibleChannels", () => {
  it("delivers on both channels for a verified Business user", () => {
    expect(eligibleChannels(base)).toEqual(["email", "whatsapp"]);
  });

  it("drops email on a hard bounce but keeps WhatsApp", () => {
    expect(eligibleChannels({ ...base, emailBounced: true })).toEqual(["whatsapp"]);
  });

  it.each(["UNVERIFIED", "PENDING", "FAILED", "OPTED_OUT"] as const)(
    "withholds WhatsApp while the number is %s",
    (status) => {
      expect(eligibleChannels({ ...base, whatsappStatus: status })).toEqual(["email"]);
    },
  );

  it("withholds WhatsApp when there is no number at all", () => {
    expect(eligibleChannels({ ...base, whatsappPhone: null })).toEqual(["email"]);
  });

  it("withholds WhatsApp below the Business tier", () => {
    expect(eligibleChannels({ ...base, plan: "PRO" })).toEqual(["email"]);
    expect(eligibleChannels({ ...base, plan: "FREE", subscriptionStatus: null })).toEqual([
      "email",
    ]);
  });

  it("withholds WhatsApp when the Business subscription has lapsed", () => {
    expect(eligibleChannels({ ...base, subscriptionStatus: "canceled" })).toEqual(["email"]);
    // …unless the deal is billed by hand (docs/06 risk B4).
    expect(
      eligibleChannels({ ...base, subscriptionStatus: "canceled", manualBilling: true }),
    ).toEqual(["email", "whatsapp"]);
  });

  it("sends nothing when the user opted out of alerts entirely", () => {
    expect(eligibleChannels({ ...base, alertChannel: "NONE" })).toEqual([]);
  });
});

describe("whatsappAllowedByPlan / channelWithoutWhatsapp", () => {
  it("is a Business+ entitlement", () => {
    expect(whatsappAllowedByPlan(base)).toBe(true);
    expect(whatsappAllowedByPlan({ ...base, plan: "PRO" })).toBe(false);
  });

  it("falls back to email rather than silencing alerts", () => {
    expect(channelWithoutWhatsapp("WHATSAPP")).toBe("EMAIL");
    expect(channelWithoutWhatsapp("EMAIL_AND_WHATSAPP")).toBe("EMAIL");
    // Choices that never involved WhatsApp are left exactly as the user set them.
    expect(channelWithoutWhatsapp("EMAIL")).toBe("EMAIL");
    expect(channelWithoutWhatsapp("NONE")).toBe("NONE");
  });
});

const item = (overrides: Partial<DigestItem> = {}): DigestItem => ({
  ocid: "ocds-py-1",
  title: "Construcción de empedrado en Itapúa",
  buyerName: "Municipalidad de Encarnación",
  deadlineLabel: "Cierra en 3 días",
  reasonLabel: "88% de coincidencia con tu perfil",
  ...overrides,
});

describe("buildWhatsappDigest", () => {
  it("uses the deadline-warning template for a single tender, linking to it", () => {
    const msg = buildWhatsappDigest("https://paraou.test", "Constructora del Sur", [item()])!;
    expect(msg.template).toBe("deadline");
    expect(msg.variables).toHaveLength(4);
    expect(msg.variables[1]).toBe("Municipalidad de Encarnación");
    expect(msg.variables[3]).toBe("https://paraou.test/licitaciones/ocds-py-1");
  });

  it("uses the digest template for several tenders, leading with the most urgent", () => {
    const msg = buildWhatsappDigest("https://paraou.test", "Constructora del Sur", [
      item(),
      item({ ocid: "ocds-py-2" }),
    ])!;
    expect(msg.template).toBe("digest");
    expect(msg.variables[0]).toBe("Constructora del Sur");
    expect(msg.variables[1]).toBe("2");
    expect(msg.variables[4]).toBe("https://paraou.test/panel");
  });

  it("url-encodes the ocid and names an unknown buyer", () => {
    const msg = buildWhatsappDigest("https://paraou.test", "X", [
      item({ ocid: "ocds a/b", buyerName: null }),
    ])!;
    expect(msg.variables[1]).toBe("Comprador no especificado");
    expect(msg.variables[3]).toBe("https://paraou.test/licitaciones/ocds%20a%2Fb");
  });

  it("returns null when there is nothing to say", () => {
    expect(buildWhatsappDigest("https://paraou.test", "X", [])).toBeNull();
  });

  it("keeps titles short enough to read on a phone", () => {
    const long = "a".repeat(200);
    expect(truncateForWhatsapp(long).length).toBeLessThanOrEqual(90);
    expect(truncateForWhatsapp("  ya  corto ")).toBe("ya corto");
  });
});
