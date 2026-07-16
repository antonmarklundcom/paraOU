import { describe, it, expect } from "vitest";
import { MockProvider, fakeEmbedding } from "../mock.js";
import type { ProfileForJudge, TenderForJudge } from "../types.js";

const constructionProfile: ProfileForJudge = {
  name: "Constructora del Este",
  description:
    "Empresa constructora especializada en obras viales y pavimentación asfáltica en la región de Itapúa y Alto Paraná.",
  categoryCodes: ["72141115"],
  keywords: ["pavimentación", "asfalto", "obras viales"],
  excludeKeywords: [],
  departments: ["Itapúa", "Alto Paraná"],
  amountMin: null,
  amountMax: "6000000000",
  certifications: [],
};

const roadTender: TenderForJudge = {
  title: "Construcción de pavimento asfáltico en Barrio San Blas",
  description: "Obras de pavimentación de 12 cuadras incluyendo cordones y desagüe pluvial.",
  buyerName: "Municipalidad de Ciudad del Este",
  categoryName: "Servicios de pavimentación",
  procurementMethod: "Concurso de Ofertas",
  amountMax: "2800000000",
  currency: "PYG",
  department: "Alto Paraná",
  deadlineAt: null,
};

const medicalTender: TenderForJudge = {
  title: "Adquisición de Insumos Médicos para Hospitales Regionales",
  description: "Provisión de jeringas, guantes y material descartable para la red de hospitales.",
  buyerName: "Ministerio de Salud Pública",
  categoryName: "Jeringas hipodérmicas",
  procurementMethod: "Licitación Pública Nacional",
  amountMax: "4500000000",
  currency: "PYG",
  department: "Central",
  deadlineAt: null,
};

describe("MockProvider.judgeMatch", () => {
  const provider = new MockProvider();

  it("scores a well-matched tender clearly higher than an unrelated one", async () => {
    const good = await provider.judgeMatch(constructionProfile, roadTender);
    const bad = await provider.judgeMatch(constructionProfile, medicalTender);
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it("scores an obviously irrelevant tender below the show threshold (50)", async () => {
    const result = await provider.judgeMatch(constructionProfile, medicalTender);
    expect(result.score).toBeLessThan(50);
    expect(result.verdict).toMatch(/weak|no/);
  });

  it("returns Spanish reasoning and cautions, zero cost", async () => {
    const result = await provider.judgeMatch(constructionProfile, roadTender);
    expect(result.fitReasons.length).toBeGreaterThan(0);
    expect(result.cautions.length).toBeGreaterThan(0);
    expect(result.usage.estCostUsd).toBe(0);
  });

  it("cautions when the tender amount exceeds the profile's amountMax", async () => {
    const bigTender: TenderForJudge = { ...roadTender, amountMax: "50000000000" };
    const result = await provider.judgeMatch(constructionProfile, bigTender);
    expect(result.cautions.some((c) => /monto/i.test(c))).toBe(true);
  });
});

describe("fakeEmbedding", () => {
  it("is deterministic and unit-normalized", () => {
    const a = fakeEmbedding("pavimentación de calles en Itapúa");
    const b = fakeEmbedding("pavimentación de calles en Itapúa");
    expect(a).toEqual(b);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("gives higher cosine similarity to related text than unrelated text", () => {
    const base = fakeEmbedding("pavimentación asfáltica obras viales");
    const related = fakeEmbedding("pavimento asfalto calles obras");
    const unrelated = fakeEmbedding("insumos médicos hospital jeringas");

    const cosine = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(cosine(base, related)).toBeGreaterThan(cosine(base, unrelated));
  });
});
