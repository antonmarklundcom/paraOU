/**
 * Provider-agnostic AI types (docs/04). Every concrete provider (Gemini, the
 * deterministic mock, Anthropic later) implements {@link AiProvider}.
 */

export interface EmbedResult {
  vector: number[];
  /** Token/cost accounting for ai_usage (docs/04 cost guardrails). */
  usage: { promptTokens: number; estCostUsd: number };
}

export interface TenderForJudge {
  title: string;
  description: string | null;
  buyerName: string | null;
  categoryName: string | null;
  procurementMethod: string | null;
  amountMax: string | null;
  currency: string;
  department: string | null;
  deadlineAt: string | null;
}

export interface ProfileForJudge {
  name: string;
  description: string;
  categoryCodes: string[];
  keywords: string[];
  excludeKeywords: string[];
  departments: string[];
  amountMin: string | null;
  amountMax: string | null;
  certifications: string[];
}

/** Structured output of the LLM judge (docs/04 §LLM judge). */
export interface JudgeResult {
  score: number; // 0-100
  verdict: "strong" | "possible" | "weak" | "no";
  fitReasons: string[];
  cautions: string[];
  usage: { promptTokens: number; completionTokens: number; estCostUsd: number };
}

export interface SummarizeResult {
  summary: string;
  usage: { promptTokens: number; completionTokens: number; estCostUsd: number };
}

export interface CategorySuggestion {
  code: string;
  name: string;
}

export interface SuggestCategoriesResult {
  suggestions: CategorySuggestion[];
  usage: { promptTokens: number; completionTokens: number; estCostUsd: number };
}

export interface AiProvider {
  readonly name: string;
  embed(text: string): Promise<EmbedResult>;
  judgeMatch(profile: ProfileForJudge, tender: TenderForJudge): Promise<JudgeResult>;
  summarize(tender: TenderForJudge): Promise<SummarizeResult>;
  /** Suggest N5/UNSPSC categories from a free-text company description (wizard step 2). */
  suggestCategories(
    description: string,
    candidates: CategorySuggestion[],
  ): Promise<SuggestCategoriesResult>;
  /** Phase 6+ (premium document analysis). Real providers may implement later. */
  analyzeDocument(url: string): Promise<never>;
}
