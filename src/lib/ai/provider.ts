import { z } from "zod";
import { env } from "../env.js";
import type { FetchFn } from "./gemini.js";
import { batchEmbedContents, generateContent } from "./gemini.js";
import {
  buildDocumentAnalysisPrompt,
  buildJudgeUserPrompt,
  buildSummaryUserPrompt,
  DOCUMENT_ANALYSIS_SCHEMA,
  DOCUMENT_ANALYSIS_SYSTEM,
  JUDGE_RESPONSE_SCHEMA,
  JUDGE_SYSTEM,
  SUGGEST_CATEGORIES_SCHEMA,
  SUGGEST_CATEGORIES_SYSTEM,
  SUMMARY_SYSTEM,
  wrapUntrusted,
  type JudgeProfileInput,
  type JudgeTenderInput,
} from "./prompts.js";
import { logAiUsage } from "./usage.js";

/**
 * Provider abstraction for all AI calls (docs/04). Gemini is the default runtime
 * provider (owner decision — cost); Anthropic is an optional drop-in configured via
 * AI_PROVIDER. Every method logs to ai_usage. Nothing outside src/lib/ai should
 * talk to a model API directly.
 */

export const judgeResultSchema = z.object({
  score: z.number().int().min(0).max(100),
  fit_reasons: z.array(z.string()).max(5),
  cautions: z.array(z.string()).max(5),
  verdict: z.enum(["strong", "possible", "weak", "no"]),
});
export type JudgeResult = z.infer<typeof judgeResultSchema>;

export const documentAnalysisSchema = z.object({
  summary: z.string(),
  requirements: z.array(z.object({ item: z.string(), note: z.string().optional() })).max(20),
  warnings: z.array(z.string()).max(10),
});
export type DocumentAnalysisResult = z.infer<typeof documentAnalysisSchema>;

export interface AiProvider {
  readonly name: string;
  /** Embed texts for pgvector storage. Dim = env.EMBEDDING_DIM. */
  embed(texts: string[], kind: "document" | "query"): Promise<number[][]>;
  /** Stage-3 match judge: one call per (profile, tender) pair. */
  judgeMatch(profile: JudgeProfileInput, tender: JudgeTenderInput): Promise<JudgeResult>;
  /** One-paragraph plain-Spanish tender summary. */
  summarize(tender: JudgeTenderInput): Promise<string>;
  /** Wizard helper: suggest category codes from a free-text company description. */
  suggestCategories(
    description: string,
    options: { code: string; name: string }[],
  ): Promise<string[]>;
  /** Premium pliego analysis (PHASE-6 #4): a requirements checklist extracted
   * from the tender's PDF text. */
  analyzeDocument(tenderTitle: string, pdfText: string): Promise<DocumentAnalysisResult>;
}

/** Parses the model's JSON, tolerating accidental markdown fences. */
export function parseJudgeJson(text: string): JudgeResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return judgeResultSchema.parse(JSON.parse(cleaned));
}

class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  constructor(private fetchFn: FetchFn = fetch) {}

  async embed(texts: string[], kind: "document" | "query"): Promise<number[][]> {
    const model = env.GEMINI_MODEL_EMBEDDING;
    const { vectors, estInputTokens } = await batchEmbedContents(
      texts,
      {
        model,
        dim: env.EMBEDDING_DIM,
        taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      },
      this.fetchFn,
    );
    await logAiUsage({
      provider: this.name,
      model,
      purpose: "embed",
      inputTokens: estInputTokens,
      outputTokens: 0,
      meta: { count: texts.length },
    });
    return vectors;
  }

  async judgeMatch(profile: JudgeProfileInput, tender: JudgeTenderInput): Promise<JudgeResult> {
    const model = env.GEMINI_MODEL_JUDGE;
    const res = await generateContent(
      {
        model,
        system: JUDGE_SYSTEM,
        user: buildJudgeUserPrompt(profile, tender),
        responseJsonSchema: JUDGE_RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
      this.fetchFn,
    );
    await logAiUsage({
      provider: this.name,
      model,
      purpose: "judge",
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    });
    return parseJudgeJson(res.text);
  }

  async summarize(tender: JudgeTenderInput): Promise<string> {
    const model = env.GEMINI_MODEL_SUMMARY;
    const res = await generateContent(
      {
        model,
        system: SUMMARY_SYSTEM,
        user: buildSummaryUserPrompt(tender),
        temperature: 0.3,
        maxOutputTokens: 512,
      },
      this.fetchFn,
    );
    await logAiUsage({
      provider: this.name,
      model,
      purpose: "summarize",
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    });
    return res.text.trim();
  }

  async suggestCategories(
    description: string,
    options: { code: string; name: string }[],
  ): Promise<string[]> {
    const model = env.GEMINI_MODEL_JUDGE; // cheap model is fine here
    const list = options.map((o) => `${o.code}: ${o.name}`).join("\n");
    const res = await generateContent(
      {
        model,
        system: SUGGEST_CATEGORIES_SYSTEM,
        user: `Categorías disponibles:\n${list}\n\nDescripción de la empresa:\n${wrapUntrusted("company_description", description)}`,
        responseJsonSchema: SUGGEST_CATEGORIES_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0.1,
        maxOutputTokens: 256,
      },
      this.fetchFn,
    );
    await logAiUsage({
      provider: this.name,
      model,
      purpose: "suggest_categories",
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    });
    const parsed = z
      .object({ categoryCodes: z.array(z.string()).max(5) })
      .parse(JSON.parse(res.text));
    // The model may echo codes not in the list — keep only real options.
    const valid = new Set(options.map((o) => o.code));
    return parsed.categoryCodes.filter((c) => valid.has(c));
  }

  async analyzeDocument(tenderTitle: string, pdfText: string): Promise<DocumentAnalysisResult> {
    const model = env.GEMINI_MODEL_ANALYSIS;
    const res = await generateContent(
      {
        model,
        system: DOCUMENT_ANALYSIS_SYSTEM,
        user: buildDocumentAnalysisPrompt(tenderTitle, pdfText),
        responseJsonSchema: DOCUMENT_ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
      this.fetchFn,
    );
    await logAiUsage({
      provider: this.name,
      model,
      purpose: "analyze_document",
      inputTokens: res.inputTokens,
      outputTokens: res.outputTokens,
    });
    return documentAnalysisSchema.parse(JSON.parse(res.text));
  }
}

class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  private fail(): never {
    throw new Error(
      "AI_PROVIDER=anthropic is not configured in this build — Gemini is the default provider (docs/04). Set AI_PROVIDER=gemini or implement src/lib/ai/provider.ts AnthropicProvider.",
    );
  }
  embed(): Promise<number[][]> {
    this.fail();
  }
  judgeMatch(): Promise<JudgeResult> {
    this.fail();
  }
  summarize(): Promise<string> {
    this.fail();
  }
  suggestCategories(): Promise<string[]> {
    this.fail();
  }
  analyzeDocument(): Promise<DocumentAnalysisResult> {
    this.fail();
  }
}

let cached: AiProvider | undefined;

/** The configured provider (env AI_PROVIDER). `fetchFn` override is for tests. */
export function getAiProvider(fetchFn?: FetchFn): AiProvider {
  if (fetchFn) {
    return env.AI_PROVIDER === "gemini" ? new GeminiProvider(fetchFn) : new AnthropicProvider();
  }
  cached ??= env.AI_PROVIDER === "gemini" ? new GeminiProvider() : new AnthropicProvider();
  return cached;
}
