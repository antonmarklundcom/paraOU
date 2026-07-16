import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "../db.js";
import { env } from "../env.js";
import { logger } from "../log.js";

/**
 * Daily spend budget + kill switch (docs/04 cost guardrails). Every AI call is
 * logged to `ai_usage` regardless of cost; paid stages (LLM judge, summaries,
 * category suggestions) check the budget FIRST and skip the call entirely once
 * today's total meets/exceeds AI_DAILY_BUDGET_USD — logging loudly so it's visible
 * in `npm run worker:dev` output and the admin endpoint.
 *
 * "Today" is a UTC calendar day; embeddings are excluded (docs/04: "~free" — the
 * budget protects against runaway judge/summary spend, not the near-zero-cost
 * recall stage).
 */

const PAID_PURPOSES = ["judge_match", "summarize", "suggest_categories"] as const;
export type PaidPurpose = (typeof PAID_PURPOSES)[number];
export type UsagePurpose = PaidPurpose | "embed_tender" | "embed_profile";

function todayStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function todaySpendUsd(client: PrismaClient = prisma): Promise<number> {
  const [row] = await client.$queryRaw<{ total: string | null }[]>(Prisma.sql`
    SELECT sum("estCostUsd")::text AS total
    FROM "AiUsage"
    WHERE "purpose" IN (${Prisma.join(PAID_PURPOSES)}) AND "createdAt" >= ${todayStartUtc()}
  `);
  return row?.total ? Number(row.total) : 0;
}

/** True when a paid AI call is allowed right now. Always true for non-paid purposes. */
export async function budgetAvailable(
  purpose: UsagePurpose,
  client: PrismaClient = prisma,
): Promise<boolean> {
  if (!PAID_PURPOSES.includes(purpose as PaidPurpose)) return true;
  const spent = await todaySpendUsd(client);
  const ok = spent < env.AI_DAILY_BUDGET_USD;
  if (!ok) {
    logger.warn(
      { spent, budget: env.AI_DAILY_BUDGET_USD, purpose },
      "AI_DAILY_BUDGET_USD reached — pausing paid AI calls until UTC midnight",
    );
  }
  return ok;
}

export async function logUsage(
  args: {
    provider: string;
    model: string;
    purpose: UsagePurpose;
    promptTokens?: number;
    completionTokens?: number;
    estCostUsd: number;
  },
  client: PrismaClient = prisma,
): Promise<void> {
  await client.aiUsage.create({
    data: {
      provider: args.provider,
      model: args.model,
      purpose: args.purpose,
      promptTokens: args.promptTokens ?? null,
      completionTokens: args.completionTokens ?? null,
      estCostUsd: args.estCostUsd,
    },
  });
}
