import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../db.js";
import { env } from "../../env.js";
import { budgetAvailable, logUsage, todaySpendUsd } from "../budget.js";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

describe.skipIf(!hasDb)("AI daily budget kill switch", () => {
  beforeAll(async () => {
    await prisma.aiUsage.deleteMany();
  });

  it("allows paid calls while under budget", async () => {
    await logUsage({ provider: "mock", model: "x", purpose: "judge_match", estCostUsd: 0.01 });
    expect(await budgetAvailable("judge_match")).toBe(true);
  });

  it("pauses paid purposes once today's spend meets the daily budget", async () => {
    await logUsage({
      provider: "mock",
      model: "x",
      purpose: "judge_match",
      estCostUsd: env.AI_DAILY_BUDGET_USD,
    });
    expect(await todaySpendUsd()).toBeGreaterThanOrEqual(env.AI_DAILY_BUDGET_USD);
    expect(await budgetAvailable("judge_match")).toBe(false);
    expect(await budgetAvailable("summarize")).toBe(false);
    expect(await budgetAvailable("suggest_categories")).toBe(false);
  });

  it("never gates embeddings (near-free, needed for basic recall)", async () => {
    expect(await budgetAvailable("embed_tender")).toBe(true);
    expect(await budgetAvailable("embed_profile")).toBe(true);
  });

  it("logs every call to ai_usage regardless of cost", async () => {
    await prisma.aiUsage.deleteMany();
    await logUsage({ provider: "mock", model: "x", purpose: "embed_tender", estCostUsd: 0 });
    const rows = await prisma.aiUsage.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.purpose).toBe("embed_tender");
  });
});
