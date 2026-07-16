import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GeminiProvider } from "../gemini.js";
import type { ProfileForJudge, TenderForJudge } from "../types.js";

const profile: ProfileForJudge = {
  name: "Constructora del Este",
  description: "Obras viales y pavimentación en Alto Paraná.",
  categoryCodes: ["72141115"],
  keywords: ["pavimentación"],
  excludeKeywords: [],
  departments: ["Alto Paraná"],
  amountMin: null,
  amountMax: "6000000000",
  certifications: [],
};

const noSleep = async () => {};

const tender: TenderForJudge = {
  title: "Construcción de pavimento asfáltico",
  description: "Obras de pavimentación de 12 cuadras.",
  buyerName: "Municipalidad de Ciudad del Este",
  categoryName: "Servicios de pavimentación",
  procurementMethod: "Concurso de Ofertas",
  amountMax: "2800000000",
  currency: "PYG",
  department: "Alto Paraná",
  deadlineAt: null,
};

function genContentResponse(jsonText: string, promptTokens = 100, completionTokens = 20) {
  return {
    candidates: [{ content: { parts: [{ text: jsonText }] } }],
    usageMetadata: { promptTokenCount: promptTokens, candidatesTokenCount: completionTokens },
  };
}

describe("GeminiProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("embed(): calls embedContent and returns the vector + usage", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }), { status: 200 }),
    );
    const provider = new GeminiProvider("test-key", "https://fake");
    const result = await provider.embed("hola mundo");

    expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    expect(result.usage.estCostUsd).toBeGreaterThan(0);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain(":embedContent");
    expect(url).toContain("key=test-key");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.content.parts[0].text).toBe("hola mundo");
    expect(body.outputDimensionality).toBe(768);
  });

  it("judgeMatch(): sends structured-output config and parses the JSON verdict", async () => {
    const payload = {
      score: 88,
      verdict: "strong",
      fit_reasons: ["Coincide con obras viales en Alto Paraná."],
      cautions: ["Verificar garantía de mantenimiento."],
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(genContentResponse(JSON.stringify(payload))), { status: 200 }),
    );
    const provider = new GeminiProvider("test-key", "https://fake");
    const result = await provider.judgeMatch(profile, tender);

    expect(result.score).toBe(88);
    expect(result.verdict).toBe("strong");
    expect(result.fitReasons).toEqual(payload.fit_reasons);
    expect(result.cautions).toEqual(payload.cautions);
    expect(result.usage.promptTokens).toBe(100);
    expect(result.usage.completionTokens).toBe(20);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain(":generateContent");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toBeDefined();
    // Tender text must be fenced as untrusted data, not sent as an instruction.
    expect(body.contents[0].parts[0].text).toContain("<tender_data>");
    expect(body.systemInstruction.parts[0].text).toMatch(/nunca como instrucciones/i);
  });

  it("judgeMatch(): throws on a schema-violating response instead of silently coercing", async () => {
    const bad = { score: "not-a-number", verdict: "strong", fit_reasons: [], cautions: [] };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(genContentResponse(JSON.stringify(bad))), { status: 200 }),
    );
    const provider = new GeminiProvider("test-key", "https://fake");
    await expect(provider.judgeMatch(profile, tender)).rejects.toThrow();
  });

  it("summarize(): returns plain text and usage", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(genContentResponse("Resumen en español simple.")), {
        status: 200,
      }),
    );
    const provider = new GeminiProvider("test-key", "https://fake");
    const result = await provider.summarize(tender);
    expect(result.summary).toBe("Resumen en español simple.");
    expect(result.usage.estCostUsd).toBeGreaterThan(0);
  });

  it("retries on 429/5xx and eventually succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ embedding: { values: [1, 2] } }), { status: 200 }),
      );
    const provider = new GeminiProvider("test-key", "https://fake", { sleep: noSleep });
    const result = await provider.embed("x");
    expect(result.vector).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on repeated 5xx", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 503 }));
    const provider = new GeminiProvider("test-key", "https://fake", {
      maxRetries: 2,
      sleep: noSleep,
    });
    await expect(provider.embed("x")).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
