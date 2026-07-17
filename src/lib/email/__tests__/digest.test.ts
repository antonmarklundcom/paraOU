import { describe, it, expect } from "vitest";
import { digestSubject, renderDigestHtml, renderDigestText, type DigestInput } from "../digest.js";

const base: DigestInput = {
  companyName: "Constructora del Este",
  appUrl: "https://paraou.example",
  unsubscribeUrl: "https://paraou.example/api/unsubscribe?token=abc",
  items: [
    {
      ocid: "ocds-1",
      title: "Pavimentación de calles",
      buyerName: "Municipalidad de Ciudad del Este",
      amountMax: "2800000000",
      deadlineAt: "2026-08-24T00:00:00Z",
      daysUntilDeadline: 9,
      reason: "85% de coincidencia con tu perfil.",
    },
  ],
};

describe("digestSubject", () => {
  it("uses singular/plural correctly and mentions the closing date", () => {
    expect(digestSubject(base)).toMatch(/^1 licitación nueva para Constructora del Este/);
    expect(digestSubject(base)).toContain("cierra el");
  });

  it("pluralizes for multiple items", () => {
    const two = { ...base, items: [...base.items, { ...base.items[0]!, ocid: "ocds-2" }] };
    expect(digestSubject(two)).toMatch(/^2 licitaciones nuevas/);
  });
});

describe("renderDigestHtml / renderDigestText", () => {
  it("includes a deep link, deadline, amount, and unsubscribe link", () => {
    const html = renderDigestHtml(base);
    expect(html).toContain("/licitaciones/ocds-1");
    expect(html).toContain("Pavimentación de calles");
    expect(html).toContain(base.unsubscribeUrl);
    expect(html).toContain("Gs.");
  });

  it("escapes HTML in user-influenced fields", () => {
    const malicious: DigestInput = {
      ...base,
      items: [{ ...base.items[0]!, title: "<script>alert(1)</script>" }],
    };
    const html = renderDigestHtml(malicious);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("plain text version lists every item with a deep link", () => {
    const text = renderDigestText(base);
    expect(text).toContain("Pavimentación de calles");
    expect(text).toContain("https://paraou.example/licitaciones/ocds-1");
    expect(text).toContain(base.unsubscribeUrl);
  });

  it("caps rendering to whatever items are passed (caller enforces max 10)", () => {
    const many = {
      ...base,
      items: Array.from({ length: 15 }, (_, i) => ({ ...base.items[0]!, ocid: `t${i}` })),
    };
    const html = renderDigestHtml(many);
    for (let i = 0; i < 15; i++) expect(html).toContain(`/licitaciones/t${i}`);
  });
});
