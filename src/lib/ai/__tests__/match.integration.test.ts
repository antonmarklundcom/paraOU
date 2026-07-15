// GEMINI_API_KEY is set via vitest.config.ts `test.env` (guaranteed before any
// module in this file's graph loads — a top-of-file process.env assignment here
// would run too late, since import statements are hoisted above it).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../db.js";
import type { JudgeResult } from "../provider.js";

/**
 * Integration tests for the match funnel against real Postgres/pgvector
 * (PHASE-4 acceptance): deterministic stages 1–2, the never-re-score cache
 * (verified via judge call count, as ai_usage would show), and the budget kill
 * switch. Stage 3 is a mock judge — no network.
 */

const judgeCalls: { tenderTitle: string }[] = [];
let judgeResult: JudgeResult = {
  score: 82,
  fit_reasons: ["Rubro coincide"],
  cautions: [],
  verdict: "strong",
};

vi.mock("../provider.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../provider.js")>();
  return {
    ...original,
    getAiProvider: () => ({
      name: "mock",
      embed: async (texts: string[]) => texts.map(() => Array(768).fill(0)),
      judgeMatch: async (_p: unknown, t: { title: string }) => {
        judgeCalls.push({ tenderTitle: t.title });
        return judgeResult;
      },
      summarize: async () => "Resumen de prueba.",
      suggestCategories: async () => [],
      analyzeDocument: async () => "",
    }),
  };
});

const { findCandidates, matchProfile } = await import("../match.js");
const { budgetExceeded } = await import("../usage.js");

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";
const day = 24 * 3600_000;

/** 768-dim unit vector with a single 1 — orthogonal per index, cosine-friendly. */
function basisVector(i: number): string {
  const v = Array(768).fill(0);
  v[i] = 1;
  return `[${v.join(",")}]`;
}

/** Vector correlated with basis 0 by `sim` (cosine similarity ≈ sim). */
function bladeVector(sim: number): string {
  const v = Array(768).fill(0);
  v[0] = sim;
  v[1] = Math.sqrt(1 - sim * sim);
  return `[${v.join(",")}]`;
}

async function seedTender(t: {
  ocid: string;
  title: string;
  status?: "OPEN" | "CLOSED";
  department?: string;
  amountMax?: string;
  deadlineDays?: number;
  sim?: number; // cosine similarity vs the profile vector
  description?: string;
}) {
  const row = await prisma.tender.create({
    data: {
      ocid: t.ocid,
      title: t.title,
      description: t.description ?? null,
      status: t.status ?? "OPEN",
      department: t.department ?? "Itapúa",
      amountMax: t.amountMax ?? "1000000000",
      currency: "PYG",
      publishedAt: new Date(),
      deadlineAt: new Date(Date.now() + (t.deadlineDays ?? 20) * day),
      raw: {},
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "Tender" SET embedding = '${bladeVector(t.sim ?? 0.9)}'::vector WHERE id = '${row.id}'`,
  );
  return row;
}

async function seedProfile(
  overrides: Partial<Parameters<typeof prisma.companyProfile.create>[0]["data"]> = {},
) {
  const profile = await prisma.companyProfile.create({
    data: {
      name: "Constructora del Sur",
      description: "Obras viales y empedrados en Itapúa",
      categoryCodes: [],
      keywords: ["empedrado"],
      excludeKeywords: [],
      departments: ["Itapúa"],
      certifications: [],
      ...overrides,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE "CompanyProfile" SET embedding = '${basisVector(0)}'::vector WHERE id = '${profile.id}'`,
  );
  return profile;
}

describe.skipIf(!hasDb)("match funnel (integration)", () => {
  beforeAll(async () => {
    await prisma.match.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.aiUsage.deleteMany();
    await prisma.tenderEvent.deleteMany();
    await prisma.award.deleteMany();
    await prisma.tender.deleteMany();
  });

  beforeEach(async () => {
    judgeCalls.length = 0;
    await prisma.match.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.aiUsage.deleteMany();
    await prisma.tender.deleteMany();
  });

  describe("stages 1+2 (deterministic SQL/vector)", () => {
    it("hard-filters status, deadline, geography, amount and exclude-words", async () => {
      const profile = await seedProfile({
        excludeKeywords: ["limpieza"],
        amountMax: "5000000000",
      });
      await seedTender({ ocid: "ok", title: "Empedrado urbano" });
      await seedTender({ ocid: "closed", title: "Cerrada", status: "CLOSED" });
      await seedTender({ ocid: "soon", title: "Cierra ya", deadlineDays: 1 });
      await seedTender({ ocid: "far", title: "Otra región", department: "Boquerón" });
      await seedTender({ ocid: "big", title: "Megaobra", amountMax: "9000000000000" });
      await seedTender({ ocid: "excl", title: "Servicio de limpieza de oficinas" });
      // Accent-insensitive exclude: "Limpìeza"≠ but "Limpieza" with accents on others
      await seedTender({ ocid: "excl2", title: "LIMPIEZA integral", description: "aseo" });

      const got = await findCandidates(profile);
      expect(got.map((c) => c.id).length).toBe(1);
      const only = await prisma.tender.findUniqueOrThrow({ where: { ocid: "ok" } });
      expect(got[0]!.id).toBe(only.id);
    });

    it("keeps tenders with NULL department (judge decides geography)", async () => {
      const profile = await seedProfile();
      await prisma.tender.create({
        data: {
          ocid: "nodept",
          title: "Sin departamento",
          status: "OPEN",
          currency: "PYG",
          deadlineAt: new Date(Date.now() + 20 * day),
          raw: {},
        },
      });
      await prisma.$executeRawUnsafe(
        `UPDATE "Tender" SET embedding = '${bladeVector(0.8)}'::vector WHERE ocid = 'nodept'`,
      );
      const got = await findCandidates(profile);
      expect(got).toHaveLength(1);
    });

    it("ranks by cosine similarity and boosts FTS keyword hits", async () => {
      const profile = await seedProfile(); // keyword: empedrado
      await seedTender({ ocid: "high", title: "Obra vial grande", sim: 0.95 });
      await seedTender({ ocid: "low", title: "Suministro general", sim: 0.5 });
      // Slightly lower cosine but mentions "empedrado" → FTS bonus lifts it above 'high'.
      await seedTender({ ocid: "kw", title: "Construcción de empedrado comunal", sim: 0.85 });

      const got = await findCandidates(profile);
      const ids = await prisma.tender.findMany({ select: { id: true, ocid: true } });
      const byId = new Map(ids.map((t) => [t.id, t.ocid]));
      expect(got.map((c) => byId.get(c.id))).toEqual(["kw", "high", "low"]);
    });

    it("respects topN", async () => {
      const profile = await seedProfile();
      for (let i = 0; i < 5; i++) {
        await seedTender({ ocid: `t${i}`, title: `Obra ${i}`, sim: 0.9 - i * 0.05 });
      }
      expect(await findCandidates(profile, { topN: 3 })).toHaveLength(3);
    });
  });

  describe("stage 3 caching (never re-score unchanged pairs)", () => {
    it("judges once, then serves from cache on re-run", async () => {
      const profile = await seedProfile();
      await seedTender({ ocid: "a", title: "Empedrado A" });

      const first = await matchProfile(profile.id);
      expect(first.judged).toBe(1);
      expect(judgeCalls).toHaveLength(1);

      const second = await matchProfile(profile.id);
      expect(second.judged).toBe(0);
      expect(second.cached).toBe(1);
      expect(judgeCalls).toHaveLength(1); // unchanged pair NOT re-sent to the LLM

      const match = await prisma.match.findFirstOrThrow();
      expect(match.score).toBe(82);
      expect(match.verdict).toBe("STRONG");
    });

    it("re-judges when the profile version bumps (edit re-scores)", async () => {
      const profile = await seedProfile();
      await seedTender({ ocid: "a", title: "Empedrado A" });
      await matchProfile(profile.id);
      expect(judgeCalls).toHaveLength(1);

      await prisma.companyProfile.update({
        where: { id: profile.id },
        data: { version: { increment: 1 } },
      });
      const rerun = await matchProfile(profile.id);
      expect(rerun.judged).toBe(1);
      expect(judgeCalls).toHaveLength(2);
    });

    it("re-judges when the tender version bumps, preserving userAction", async () => {
      const profile = await seedProfile();
      const t = await seedTender({ ocid: "a", title: "Empedrado A" });
      await matchProfile(profile.id);
      await prisma.match.updateMany({ data: { userAction: "SAVED" } });

      await prisma.tender.update({ where: { id: t.id }, data: { version: { increment: 1 } } });
      judgeResult = { ...judgeResult, score: 61, verdict: "possible" };
      const rerun = await matchProfile(profile.id);
      judgeResult = { ...judgeResult, score: 82, verdict: "strong" };

      expect(rerun.judged).toBe(1);
      const match = await prisma.match.findFirstOrThrow();
      expect(match.score).toBe(61);
      expect(match.userAction).toBe("SAVED"); // user signal survives re-scoring
    });

    it("stores low scores too — they are cache entries, not shown", async () => {
      judgeResult = { score: 12, fit_reasons: [], cautions: [], verdict: "no" };
      const profile = await seedProfile();
      await seedTender({ ocid: "bad", title: "Insumos médicos" });
      await matchProfile(profile.id);
      judgeResult = { score: 82, fit_reasons: ["Rubro coincide"], cautions: [], verdict: "strong" };

      expect(await prisma.match.count()).toBe(1);
      const again = await matchProfile(profile.id);
      expect(again.judged).toBe(0); // low-score pair still never re-sent
    });
  });

  describe("kill switch", () => {
    it("budgetExceeded trips once today's est. spend passes the budget", async () => {
      expect(await budgetExceeded()).toBe(false);
      await prisma.aiUsage.create({
        data: {
          provider: "gemini",
          model: "gemini-2.5-flash-lite",
          purpose: "judge",
          estCostUsd: 100, // >> AI_DAILY_BUDGET_USD (default 5)
        },
      });
      expect(await budgetExceeded()).toBe(true);
    });

    it("pauses stage 3 mid-run and reports it", async () => {
      await prisma.aiUsage.create({
        data: { provider: "gemini", model: "x", purpose: "judge", estCostUsd: 100 },
      });
      const profile = await seedProfile();
      await seedTender({ ocid: "a", title: "Empedrado A" });

      const run = await matchProfile(profile.id);
      expect(run.budgetPaused).toBe(true);
      expect(run.judged).toBe(0);
      expect(judgeCalls).toHaveLength(0); // no LLM calls once the budget is blown
    });

    // Other integration test files share this Postgres and run in the same
    // process (fileParallelism: false) — an unbounded AiUsage row here would
    // otherwise trip every other file's budgetExceeded() check for the rest
    // of the run.
    afterEach(async () => {
      await prisma.aiUsage.deleteMany();
    });
  });
});
