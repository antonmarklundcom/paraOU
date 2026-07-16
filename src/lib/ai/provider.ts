import type { PrismaClient } from "@prisma/client";
import { env, aiConfigured } from "../env.js";
import { prisma } from "../db.js";
import { GeminiProvider } from "./gemini.js";
import { MockProvider } from "./mock.js";
import { budgetAvailable, logUsage } from "./budget.js";
import type {
  AiProvider,
  CategorySuggestion,
  EmbedResult,
  JudgeResult,
  ProfileForJudge,
  SuggestCategoriesResult,
  SummarizeResult,
  TenderForJudge,
} from "./types.js";

/**
 * Provider abstraction entrypoint (docs/04, PHASE-4 step 0). Selects the real
 * Gemini provider when `GEMINI_API_KEY` is set, otherwise the deterministic mock —
 * and wraps every call with ai_usage logging + the daily budget kill switch so
 * callers never have to remember to do either.
 */

let cached: AiProvider | null = null;

function rawProvider(): AiProvider {
  if (cached) return cached;
  if (env.AI_PROVIDER === "anthropic") {
    throw new Error(
      "AI_PROVIDER=anthropic is not implemented yet — the Gemini provider is required per docs/04. " +
        "Set AI_PROVIDER=gemini (default) or implement src/lib/ai/anthropic.ts.",
    );
  }
  cached = aiConfigured() ? new GeminiProvider(env.GEMINI_API_KEY!) : new MockProvider();
  return cached;
}

/** Test-only hook to reset the memoized provider between suites. */
export function resetProviderCache(): void {
  cached = null;
}

export interface Budgeted<T> {
  result: T | null;
  skipped: boolean;
}

async function withUsage<
  T extends { usage: { promptTokens: number; completionTokens?: number; estCostUsd: number } },
>(
  purpose: "embed_tender" | "embed_profile" | "judge_match" | "summarize" | "suggest_categories",
  client: PrismaClient,
  fn: () => Promise<T>,
): Promise<Budgeted<T>> {
  if (!(await budgetAvailable(purpose, client))) {
    return { result: null, skipped: true };
  }
  const provider = rawProvider();
  const result = await fn();
  await logUsage(
    {
      provider: provider.name,
      model: modelFor(purpose),
      purpose,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
      estCostUsd: result.usage.estCostUsd,
    },
    client,
  );
  return { result, skipped: false };
}

function modelFor(purpose: string): string {
  switch (purpose) {
    case "embed_tender":
    case "embed_profile":
      return env.GEMINI_EMBED_MODEL;
    case "judge_match":
    case "suggest_categories":
      return env.GEMINI_JUDGE_MODEL;
    case "summarize":
      return env.GEMINI_SUMMARY_MODEL;
    default:
      return "unknown";
  }
}

export async function embedTender(
  text: string,
  client: PrismaClient = prisma,
): Promise<Budgeted<EmbedResult>> {
  return withUsage("embed_tender", client, () => rawProvider().embed(text));
}

export async function embedProfile(
  text: string,
  client: PrismaClient = prisma,
): Promise<Budgeted<EmbedResult>> {
  return withUsage("embed_profile", client, () => rawProvider().embed(text));
}

export async function judgeMatch(
  profile: ProfileForJudge,
  tender: TenderForJudge,
  client: PrismaClient = prisma,
): Promise<Budgeted<JudgeResult>> {
  return withUsage("judge_match", client, () => rawProvider().judgeMatch(profile, tender));
}

export async function summarizeTender(
  tender: TenderForJudge,
  client: PrismaClient = prisma,
): Promise<Budgeted<SummarizeResult>> {
  return withUsage("summarize", client, () => rawProvider().summarize(tender));
}

export async function suggestCategories(
  description: string,
  candidates: CategorySuggestion[],
  client: PrismaClient = prisma,
): Promise<Budgeted<SuggestCategoriesResult>> {
  return withUsage("suggest_categories", client, () =>
    rawProvider().suggestCategories(description, candidates),
  );
}

export function currentProviderName(): string {
  return rawProvider().name;
}
