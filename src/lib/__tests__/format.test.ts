import { describe, it, expect } from "vitest";
import {
  formatGs,
  formatUsdApprox,
  formatDate,
  deadlinePhrase,
  referencePercentLabel,
} from "../format.js";

describe("formatGs", () => {
  it("scales guaraní amounts compactly (es-PY)", () => {
    expect(formatGs("4500000000")).toBe("Gs. 4,5 mil M");
    expect(formatGs("950000000")).toBe("Gs. 950 mill.");
    expect(formatGs(120000)).toBe("Gs. 120.000");
  });
  it("handles missing amounts", () => {
    expect(formatGs(null)).toBe("Gs. —");
    expect(formatGs("")).toBe("Gs. —");
  });
});

describe("formatUsdApprox", () => {
  it("converts PYG to an approximate USD string", () => {
    expect(formatUsdApprox("4500000000", 7300)).toMatch(/^~USD /);
    expect(formatUsdApprox(null, 7300)).toBeNull();
  });
});

describe("formatDate (America/Asuncion, not UTC)", () => {
  it("renders in Asunción local time, not the server's UTC", () => {
    // 02:00Z on the 24th is still the 23rd in Asunción (UTC-3/-4).
    // A UTC render would say 24 — this proves we localize.
    const s = formatDate("2024-07-24T02:00:00Z");
    expect(s).toMatch(/23\s+jul/i); // Asunción day; a UTC render would say "24 jul"
  });
});

describe("referencePercentLabel (PHASE-F4 award notifications)", () => {
  it("says how far below the reference a winning award landed", () => {
    expect(referencePercentLabel("800000", "1000000")).toBe("20% por debajo de la referencia");
  });
  it("says when it landed above the reference", () => {
    expect(referencePercentLabel("1200000", "1000000")).toBe("20% por encima de la referencia");
  });
  it("returns null with no reference amount to compare against", () => {
    expect(referencePercentLabel("800000", null)).toBeNull();
    expect(referencePercentLabel("800000", undefined)).toBeNull();
  });
  it("returns null with no winning amount", () => {
    expect(referencePercentLabel(null, "1000000")).toBeNull();
  });
});

describe("deadlinePhrase", () => {
  it("phrases the countdown in Spanish", () => {
    expect(deadlinePhrase(null)).toBe("Sin fecha límite");
    expect(deadlinePhrase(-1)).toBe("Cerrada");
    expect(deadlinePhrase(0)).toBe("Cierra hoy");
    expect(deadlinePhrase(1)).toBe("Cierra mañana");
    expect(deadlinePhrase(9)).toBe("Cierra en 9 días");
  });
});
