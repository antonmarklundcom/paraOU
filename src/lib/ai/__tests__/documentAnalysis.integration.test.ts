import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../db.js";
import { env } from "../../env.js";

/**
 * Document analysis cache + quota (PHASE-6 #4 acceptance: "returns a checklist
 * for a real pliego PDF and decrements quota"). The AI provider and PDF fetch
 * are mocked — this tests the caching/quota/gating logic, not Gemini or
 * pdf-parse themselves (those are exercised by scripts/ai-smoke.ts and the
 * hand-built-PDF smoke test respectively).
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

const analyzeDocumentMock = vi.fn(async () => ({
  summary: "Resumen de prueba",
  requirements: [{ item: "ISO 9001", note: "obligatorio" }],
  warnings: [] as string[],
}));

vi.mock("../provider.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../provider.js")>();
  return {
    ...original,
    getAiProvider: () => ({
      name: "mock",
      embed: async () => [],
      judgeMatch: async () => {
        throw new Error("not used");
      },
      summarize: async () => "",
      suggestCategories: async () => [],
      analyzeDocument: analyzeDocumentMock,
    }),
  };
});

const { analyzeTenderDocument, DocumentAnalysisError } = await import("../documentAnalysis.js");

// A tiny valid single-page PDF with extractable text — long enough to clear
// documentAnalysis.ts's MIN_EXTRACTED_CHARS "scanned, no OCR" threshold.
function buildTinyPdf(): Buffer {
  const lines = [
    "Requisitos del pliego de licitacion publica.",
    "Certificado ISO 9001 vigente es obligatorio para la oferta.",
    "Garantia de mantenimiento de oferta equivalente al cinco por ciento.",
    "Plazo de entrega de la obra: ciento ochenta dias corridos desde la firma.",
    "Capacidad financiera minima acreditable segun balance del ultimo ejercicio.",
  ];
  const content = lines
    .map((line, i) => `BT /F1 12 Tf 10 ${90 - i * 15} Td (${line}) Tj ET`)
    .join("\n");
  const stream = `${content}\n`;
  const pdf = `%PDF-1.1
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 400 200]/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length ${Buffer.byteLength(stream, "utf-8")}>>stream
${stream}endstream
endobj
xref
0 6
0000000000 65535 f
trailer<</Size 6/Root 1 0 R>>
startxref
0
%%EOF`;
  return Buffer.from(pdf, "utf-8");
}
const TINY_PDF = buildTinyPdf();

let originalFetch: typeof fetch;

describe.skipIf(!hasDb)("analyzeTenderDocument (integration)", () => {
  beforeAll(async () => {
    await prisma.documentAnalysis.deleteMany();
    await prisma.user.deleteMany({ where: { email: { contains: "docanalysis-test" } } });
    await prisma.tender.deleteMany({ where: { ocid: { startsWith: "doc-" } } });
  });

  beforeEach(async () => {
    analyzeDocumentMock.mockClear();
    await prisma.documentAnalysis.deleteMany();
    await prisma.user.deleteMany({ where: { email: { contains: "docanalysis-test" } } });
    await prisma.tender.deleteMany({ where: { ocid: { startsWith: "doc-" } } });
    // Defensive: another integration test file may have left a budget-blowing
    // AiUsage row (they run serially in one shared Postgres).
    await prisma.aiUsage.deleteMany();
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response(new Uint8Array(TINY_PDF)),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  async function seedUserAndTender(plan: "FREE" | "BUSINESS", ocid: string) {
    const user = await prisma.user.create({
      data: { email: `docanalysis-test-${ocid}@example.com`, plan },
    });
    const tender = await prisma.tender.create({
      data: {
        ocid,
        title: "Obra de prueba",
        status: "OPEN",
        currency: "PYG",
        documentsUrl: "https://example.com/pliego.pdf",
        raw: {},
      },
    });
    return { user, tender };
  }

  it("FREE users are rejected before any fetch/parse/LLM work", async () => {
    const { user, tender } = await seedUserAndTender("FREE", "doc-free");
    await expect(analyzeTenderDocument(user.id, "FREE", tender.id)).rejects.toThrow(
      DocumentAnalysisError,
    );
    expect(analyzeDocumentMock).not.toHaveBeenCalled();
  });

  it("BUSINESS user gets a checklist and it's cached for the next call", async () => {
    const { user, tender } = await seedUserAndTender("BUSINESS", "doc-business");
    const first = await analyzeTenderDocument(user.id, "BUSINESS", tender.id);
    expect(first.cached).toBe(false);
    expect(first.requirements[0]?.item).toBe("ISO 9001");
    expect(analyzeDocumentMock).toHaveBeenCalledTimes(1);

    const second = await analyzeTenderDocument(user.id, "BUSINESS", tender.id);
    expect(second.cached).toBe(true);
    expect(analyzeDocumentMock).toHaveBeenCalledTimes(1); // cache hit — no re-bill
  });

  it("a cache hit does not count against the monthly quota", async () => {
    const { user, tender } = await seedUserAndTender("BUSINESS", "doc-quota-cache");
    for (let i = 0; i < 5; i++) {
      await analyzeTenderDocument(user.id, "BUSINESS", tender.id);
    }
    expect(analyzeDocumentMock).toHaveBeenCalledTimes(1);
    expect(await prisma.documentAnalysis.count({ where: { userId: user.id } })).toBe(1);
  });

  it("enforces the monthly quota across distinct documents", async () => {
    const { user } = await seedUserAndTender("BUSINESS", "doc-quota-1");
    const originalQuota = env.DOCUMENT_ANALYSIS_MONTHLY_QUOTA;
    (env as { DOCUMENT_ANALYSIS_MONTHLY_QUOTA: number }).DOCUMENT_ANALYSIS_MONTHLY_QUOTA = 2;
    try {
      const tenders = await Promise.all(
        ["doc-quota-2", "doc-quota-3", "doc-quota-4"].map((ocid) =>
          prisma.tender.create({
            data: {
              ocid,
              title: "Obra",
              status: "OPEN",
              currency: "PYG",
              documentsUrl: `https://example.com/${ocid}.pdf`,
              raw: {},
            },
          }),
        ),
      );
      await analyzeTenderDocument(user.id, "BUSINESS", tenders[0]!.id);
      await analyzeTenderDocument(user.id, "BUSINESS", tenders[1]!.id);
      await expect(analyzeTenderDocument(user.id, "BUSINESS", tenders[2]!.id)).rejects.toThrow(
        /quota/i,
      );
    } finally {
      (env as { DOCUMENT_ANALYSIS_MONTHLY_QUOTA: number }).DOCUMENT_ANALYSIS_MONTHLY_QUOTA =
        originalQuota;
    }
  });

  it("throws NO_DOCUMENTS for a tender without a documentsUrl", async () => {
    const user = await prisma.user.create({
      data: { email: "docanalysis-test-nodoc@example.com", plan: "BUSINESS" },
    });
    const tender = await prisma.tender.create({
      data: { ocid: "doc-nodoc", title: "Sin pliego", status: "OPEN", currency: "PYG", raw: {} },
    });
    await expect(analyzeTenderDocument(user.id, "BUSINESS", tender.id)).rejects.toThrow(
      /no linked documents/i,
    );
  });
});
