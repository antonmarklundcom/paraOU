import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { limitsFor } from "../plan.js";
import { getAiProvider } from "./provider.js";
import { budgetExceeded } from "./usage.js";
import type { Plan } from "@prisma/client";

/**
 * "Analizar pliego" (PHASE-6 #4, Business tier): fetch the tender's PDF,
 * extract text, run the premium document-analysis model, cache the result
 * forever per (tenderId, documentsUrl) so re-viewing never re-bills the quota.
 * OCR is out of scope v1 — a scanned PDF with no extractable text degrades to a
 * "not supported yet" result instead of erroring.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20MB — pliegos are heavy but finite
const MIN_EXTRACTED_CHARS = 200; // below this, treat as "scanned, no OCR"

export class DocumentAnalysisError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function fetchPdfText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new DocumentAnalysisError("FETCH_FAILED", `Could not fetch the document (${res.status})`);
  }
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PDF_BYTES) {
    throw new DocumentAnalysisError("TOO_LARGE", "Document exceeds the size limit for analysis");
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.byteLength > MAX_PDF_BYTES) {
    throw new DocumentAnalysisError("TOO_LARGE", "Document exceeds the size limit for analysis");
  }

  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    return parsed.text ?? "";
  } finally {
    await parser.destroy();
  }
}

/** Calendar-month quota (America/Asuncion) — resets on the 1st. */
async function monthlyUsage(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 3 * 3600_000);
  return prisma.documentAnalysis.count({
    where: { userId, createdAt: { gte: monthStart } },
  });
}

export interface AnalyzeResult {
  summary: string;
  requirements: { item: string; note?: string }[];
  warnings: string[];
  cached: boolean;
}

export async function analyzeTenderDocument(
  userId: string,
  userPlan: Plan,
  tenderId: string,
): Promise<AnalyzeResult> {
  if (!limitsFor(userPlan).documentAnalysis) {
    throw new DocumentAnalysisError(
      "PLAN_LIMIT",
      "Document analysis is a Business-tier feature — upgrade at /precios",
    );
  }

  const tender = await prisma.tender.findUniqueOrThrow({
    where: { id: tenderId },
    select: { title: true, documentsUrl: true },
  });
  if (!tender.documentsUrl) {
    throw new DocumentAnalysisError("NO_DOCUMENTS", "This tender has no linked documents");
  }

  // Cache hit: never re-bill the quota for a document already analyzed by anyone.
  const cached = await prisma.documentAnalysis.findUnique({
    where: { tenderId_documentsUrl: { tenderId, documentsUrl: tender.documentsUrl } },
  });
  if (cached) {
    const checklist = cached.checklist as unknown as Omit<AnalyzeResult, "cached">;
    return { ...checklist, cached: true };
  }

  const used = await monthlyUsage(userId);
  if (used >= env.DOCUMENT_ANALYSIS_MONTHLY_QUOTA) {
    throw new DocumentAnalysisError(
      "QUOTA_EXCEEDED",
      `Monthly document analysis quota (${env.DOCUMENT_ANALYSIS_MONTHLY_QUOTA}) reached`,
    );
  }
  if (await budgetExceeded()) {
    throw new DocumentAnalysisError("AI_BUDGET_EXCEEDED", "Daily AI budget reached, try tomorrow");
  }

  let text: string;
  try {
    text = await fetchPdfText(tender.documentsUrl);
  } catch (err) {
    if (err instanceof DocumentAnalysisError) throw err;
    logger.error(
      { tenderId, err: err instanceof Error ? err.message : String(err) },
      "pliego fetch/parse failed",
    );
    throw new DocumentAnalysisError("PARSE_FAILED", "Could not read this document");
  }

  if (text.trim().length < MIN_EXTRACTED_CHARS) {
    const result: AnalyzeResult = {
      summary: "No se pudo extraer texto de este documento (probablemente escaneado).",
      requirements: [],
      warnings: [
        "Documento escaneado sin OCR — no soportado todavía. Revisá el pliego manualmente.",
      ],
      cached: false,
    };
    await prisma.documentAnalysis.create({
      data: {
        userId,
        tenderId,
        documentsUrl: tender.documentsUrl,
        checklist: result as never,
      },
    });
    return result;
  }

  const checklist = await getAiProvider().analyzeDocument(tender.title, text);
  const result: AnalyzeResult = { ...checklist, cached: false };
  await prisma.documentAnalysis.create({
    data: { userId, tenderId, documentsUrl: tender.documentsUrl, checklist: result as never },
  });
  return result;
}
