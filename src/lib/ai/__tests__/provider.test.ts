// Recorded-response tests for stage-3 parsing (PHASE-4 acceptance) — the fake
// fetch returns payloads captured from the live v1beta API shape.
process.env.GEMINI_API_KEY ??= "test-key";

import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../db.js";
import { getAiProvider, parseJudgeJson } from "../provider.js";
import { estimateCostUsd } from "../pricing.js";
import { asuncionDayStart } from "../usage.js";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

const judgePayload = {
  score: 82,
  fit_reasons: ["Rubro vial coincide", "Monto dentro del rango"],
  cautions: ["Visita de obra obligatoria"],
  verdict: "strong",
};

/** Shape recorded from generateContent (v1beta, 2026-07). */
function generateContentResponse(text: string) {
  return {
    candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 700, candidatesTokenCount: 60, thoughtsTokenCount: 15 },
  };
}

function fakeFetch(body: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

describe("parseJudgeJson", () => {
  it("parses plain JSON", () => {
    expect(parseJudgeJson(JSON.stringify(judgePayload)).score).toBe(82);
  });

  it("tolerates accidental markdown fences", () => {
    const fenced = "```json\n" + JSON.stringify(judgePayload) + "\n```";
    expect(parseJudgeJson(fenced).verdict).toBe("strong");
  });

  it("rejects out-of-range scores", () => {
    expect(() => parseJudgeJson(JSON.stringify({ ...judgePayload, score: 250 }))).toThrow();
  });

  it("rejects unknown verdicts", () => {
    expect(() => parseJudgeJson(JSON.stringify({ ...judgePayload, verdict: "maybe" }))).toThrow();
  });
});

describe("estimateCostUsd", () => {
  it("prices known models per token table", () => {
    // 1M in + 1M out of flash-lite = 0.10 + 0.40
    expect(estimateCostUsd("gemini-2.5-flash-lite", 1_000_000, 1_000_000)).toBeCloseTo(0.5);
  });
  it("prices unknown models at the expensive fallback (kill switch errs early)", () => {
    expect(estimateCostUsd("mystery-model", 1_000_000, 0)).toBeCloseTo(1.25);
  });
});

describe("asuncionDayStart", () => {
  it("rolls the day at midnight UTC-3", () => {
    // 02:59 UTC = 23:59 previous day in Asuncion.
    const d1 = asuncionDayStart(new Date("2026-07-12T02:59:00Z"));
    expect(d1.toISOString()).toBe("2026-07-11T03:00:00.000Z");
    const d2 = asuncionDayStart(new Date("2026-07-12T03:01:00Z"));
    expect(d2.toISOString()).toBe("2026-07-12T03:00:00.000Z");
  });
});

describe.skipIf(!hasDb)("GeminiProvider (recorded responses)", () => {
  beforeAll(async () => {
    await prisma.aiUsage.deleteMany();
  });

  const profile = {
    name: "Constructora",
    description: "Obras viales",
    categoryCodes: [],
    keywords: [],
    excludeKeywords: [],
    departments: [],
    amountMin: null,
    amountMax: null,
    certifications: [],
  };
  const tender = {
    title: "Empedrado",
    description: null,
    buyerName: null,
    categoryName: null,
    procurementMethod: null,
    amountMax: null,
    currency: "PYG",
    deadlineAt: null,
    department: null,
  };

  it("judgeMatch parses a recorded response and logs usage (incl. thinking tokens)", async () => {
    const provider = getAiProvider(
      fakeFetch(generateContentResponse(JSON.stringify(judgePayload))),
    );
    const result = await provider.judgeMatch(profile, tender);
    expect(result.score).toBe(82);
    expect(result.fit_reasons).toHaveLength(2);

    const usage = await prisma.aiUsage.findFirstOrThrow({ where: { purpose: "judge" } });
    expect(usage.inputTokens).toBe(700);
    expect(usage.outputTokens).toBe(75); // 60 candidates + 15 thoughts
    expect(Number(usage.estCostUsd)).toBeGreaterThan(0);
  });

  it("judgeMatch throws on malformed model output instead of storing garbage", async () => {
    const provider = getAiProvider(fakeFetch(generateContentResponse("no es json")));
    await expect(provider.judgeMatch(profile, tender)).rejects.toThrow();
  });

  it("embed validates vector count and dimension", async () => {
    const dim = Number(process.env.EMBEDDING_DIM ?? 768);
    const good = { embeddings: [{ values: Array(dim).fill(0.1) }] };
    const provider = getAiProvider(fakeFetch(good));
    const vectors = await provider.embed(["hola"], "document");
    expect(vectors[0]).toHaveLength(dim);

    const bad = { embeddings: [{ values: [0.1, 0.2] }] };
    await expect(getAiProvider(fakeFetch(bad)).embed(["hola"], "document")).rejects.toThrow(
      /shape mismatch/,
    );
  });
});
