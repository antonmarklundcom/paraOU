import { describe, expect, it } from "vitest";
import { digestSubject, type DigestItem } from "../DigestEmail.js";

const item = (overrides: Partial<DigestItem> = {}): DigestItem => ({
  ocid: "t-1",
  title: "Construcción de empedrado",
  buyerName: "Municipalidad X",
  deadlineLabel: "Cierra en 10 días",
  reasonLabel: "80% de coincidencia",
  ...overrides,
});

describe("digestSubject", () => {
  it("singularizes for exactly one item and includes the deadline without duplicating 'cierra'", () => {
    const subject = digestSubject("Constructora del Sur", [item()]);
    expect(subject).toBe(
      "1 licitación nueva para Constructora del Sur — la primera: cierra en 10 días",
    );
    expect(subject).not.toMatch(/cierra.*cierra/i);
  });

  it("pluralizes for multiple items", () => {
    const subject = digestSubject("Constructora del Sur", [item(), item({ ocid: "t-2" })]);
    expect(subject).toMatch(/^2 licitaciones nuevas/);
  });

  it("omits the deadline clause when there are no items", () => {
    expect(digestSubject("Constructora del Sur", [])).toBe(
      "0 licitaciones nuevas para Constructora del Sur",
    );
  });
});
