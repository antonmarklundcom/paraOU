import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { estimateCostUsd } from "./pricing.js";

/**
 * AI usage accounting + the daily budget kill switch (docs/04 cost guardrails).
 * Every AI call MUST be logged via `logAiUsage`; spenders MUST check
 * `budgetExceeded()` before batches of non-essential calls (stage-3 judging,
 * summaries) and pause when it trips.
 */

export type AiPurpose =
  | "embed"
  | "judge"
  | "summarize"
  | "suggest_categories"
  | "analyze_document";

export async function logAiUsage(entry: {
  provider: string;
  model: string;
  purpose: AiPurpose;
  inputTokens: number;
  outputTokens: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const estCostUsd = estimateCostUsd(entry.model, entry.inputTokens, entry.outputTokens);
  await prisma.aiUsage.create({
    data: {
      provider: entry.provider,
      model: entry.model,
      purpose: entry.purpose,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      estCostUsd,
      meta: entry.meta as never,
    },
  });
}

/** Start of the current day in America/Asuncion, as a UTC Date (docs: PY timezone). */
export function asuncionDayStart(now = new Date()): Date {
  // America/Asuncion is UTC-3 year-round since 2024 (DST abolished).
  const shifted = new Date(now.getTime() - 3 * 3600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() + 3 * 3600_000);
}

export async function todaySpendUsd(now = new Date()): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({
    _sum: { estCostUsd: true },
    where: { createdAt: { gte: asuncionDayStart(now) } },
  });
  return Number(agg._sum.estCostUsd ?? 0);
}

/**
 * The kill switch. True once today's estimated spend passes AI_DAILY_BUDGET_USD.
 * Callers pause discretionary AI work (match judging, summaries) until the
 * Asuncion day rolls over. Logs loudly — this should page the owner, not hide.
 */
export async function budgetExceeded(now = new Date()): Promise<boolean> {
  const spend = await todaySpendUsd(now);
  if (spend >= env.AI_DAILY_BUDGET_USD) {
    logger.error(
      { spendUsd: spend, budgetUsd: env.AI_DAILY_BUDGET_USD },
      "AI DAILY BUDGET EXCEEDED — pausing AI jobs until the next America/Asuncion day",
    );
    return true;
  }
  return false;
}
