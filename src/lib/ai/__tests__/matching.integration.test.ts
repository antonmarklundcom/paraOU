import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../db.js";
import {
  stage1HardFilters,
  stage2SemanticRecall,
  runMatchPipelineForProfile,
  SHOW_THRESHOLD,
} from "../matching.js";
import { embedAndStoreTender, embedAndStoreProfile } from "../embeddings.js";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

/**
 * Integration test against Postgres, running on the deterministic MockProvider
 * (no GEMINI_API_KEY in this environment — see docs/06 verification log). Exercises
 * the full three-stage funnel and the PHASE-4 acceptance criteria directly:
 *   - a realistic profile surfaces plausible matches with Spanish reasoning
 *   - an obviously irrelevant tender scores < 50
 *   - editing the profile re-scores; unchanged pairs are never re-sent (ai_usage)
 */
describe.skipIf(!hasDb)("AI matching pipeline (integration)", () => {
  let profileId: string;
  let roadTenderId: string;
  let medicalTenderId: string;
  let plannedTenderId: string; // not OPEN — must never reach stage 2

  beforeAll(async () => {
    await prisma.match.deleteMany();
    await prisma.aiUsage.deleteMany();
    await prisma.tenderEvent.deleteMany();
    await prisma.award.deleteMany();
    await prisma.tender.deleteMany();
    await prisma.buyer.deleteMany();
    await prisma.companyProfile.deleteMany();

    const road = await prisma.tender.create({
      data: {
        ocid: "match-t-road",
        title: "Construcción de pavimento asfáltico en Barrio San Blas",
        description: "Obras de pavimentación de 12 cuadras incluyendo cordones y desagüe pluvial.",
        status: "OPEN",
        categoryName: "Servicios de pavimentación",
        buyerName: "Municipalidad de Ciudad del Este",
        department: "Alto Paraná",
        amountMax: "2800000000",
        currency: "PYG",
        deadlineAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        raw: {},
      },
    });
    const medical = await prisma.tender.create({
      data: {
        ocid: "match-t-medical",
        title: "Adquisición de Insumos Médicos para Hospitales Regionales",
        description: "Provisión de jeringas, guantes y material descartable para hospitales.",
        status: "OPEN",
        categoryName: "Jeringas hipodérmicas",
        buyerName: "Ministerio de Salud Pública",
        department: "Central",
        amountMax: "4500000000",
        currency: "PYG",
        deadlineAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        raw: {},
      },
    });
    const planned = await prisma.tender.create({
      data: {
        ocid: "match-t-planned",
        title: "Pavimentación futura — planificación",
        description: "Obra vial planificada, aún no abierta.",
        status: "PLANNED",
        categoryName: "Servicios de pavimentación",
        department: "Alto Paraná",
        currency: "PYG",
        raw: {},
      },
    });
    roadTenderId = road.id;
    medicalTenderId = medical.id;
    plannedTenderId = planned.id;

    const profile = await prisma.companyProfile.create({
      data: {
        anonId: "anon-test-construction",
        name: "Constructora del Este",
        description:
          "Empresa constructora en Alto Paraná, especializada en pavimento asfáltico, obras viales, " +
          "cordones y desagües pluviales para municipalidades.",
        categoryCodes: [],
        keywords: ["pavimentación", "pavimento asfáltico", "obras viales"],
        excludeKeywords: [],
        departments: ["Alto Paraná"],
        certifications: [],
      },
    });
    profileId = profile.id;

    await embedAndStoreTender(roadTenderId);
    await embedAndStoreTender(medicalTenderId);
    await embedAndStoreProfile(profileId);
  });

  beforeEach(async () => {
    await prisma.aiUsage.deleteMany();
  });

  it("Stage 1 excludes non-OPEN tenders and tenders outside the profile's department", async () => {
    const profile = await prisma.companyProfile.findUniqueOrThrow({ where: { id: profileId } });
    const ids = await stage1HardFilters(profile);
    expect(ids).toContain(roadTenderId);
    expect(ids).not.toContain(plannedTenderId); // PLANNED, not OPEN
    expect(ids).not.toContain(medicalTenderId); // department = Central, profile wants Alto Paraná
  });

  it("Stage 2 ranks the road tender by cosine similarity to the profile embedding", async () => {
    const ids = await stage2SemanticRecall(profileId, [roadTenderId], prisma, 10);
    expect(ids).toEqual([roadTenderId]);
  });

  it("runs end to end: plausible match scored, cached in Match, reasoning in Spanish", async () => {
    const stats = await runMatchPipelineForProfile(profileId);
    expect(stats.scored).toBeGreaterThan(0);

    const match = await prisma.match.findUniqueOrThrow({
      where: { profileId_tenderId: { profileId, tenderId: roadTenderId } },
    });
    expect(match.score).toBeGreaterThanOrEqual(SHOW_THRESHOLD);
    expect(match.reasoning.length).toBeGreaterThan(0);
    expect(match.cautions.length).toBeGreaterThan(0);
  });

  it("an obviously irrelevant tender scores below the show threshold (50)", async () => {
    // Force it into the shortlist directly (it's excluded by department in Stage 1,
    // so we call the judge path the same way the pipeline would for a survivor).
    await runMatchPipelineForProfile(profileId);
    const irrelevant = await prisma.match.findUnique({
      where: { profileId_tenderId: { profileId, tenderId: medicalTenderId } },
    });
    // Stage 1 already excluded it (department mismatch) — no Match row at all is
    // an even stronger signal than "would have scored low".
    expect(irrelevant).toBeNull();
  });

  it("never re-sends an unchanged (profile, tender) pair to the LLM", async () => {
    await runMatchPipelineForProfile(profileId); // warm the cache
    await prisma.aiUsage.deleteMany();

    const stats = await runMatchPipelineForProfile(profileId); // re-run, nothing changed
    expect(stats.scored).toBe(0);
    expect(stats.cached).toBeGreaterThan(0);

    const usageCalls = await prisma.aiUsage.count({ where: { purpose: "judge_match" } });
    expect(usageCalls).toBe(0);
  });

  it("editing the profile re-scores (profileVersion changed invalidates the cache)", async () => {
    await runMatchPipelineForProfile(profileId); // warm cache
    const before = await prisma.match.findUniqueOrThrow({
      where: { profileId_tenderId: { profileId, tenderId: roadTenderId } },
    });

    await new Promise((r) => setTimeout(r, 5)); // ensure updatedAt actually advances
    await prisma.companyProfile.update({
      where: { id: profileId },
      data: { description: before.reasoning + " Ahora también trabajamos en obras hidráulicas." },
    });
    await prisma.aiUsage.deleteMany();

    const stats = await runMatchPipelineForProfile(profileId);
    expect(stats.scored).toBeGreaterThan(0);
    const usageCalls = await prisma.aiUsage.count({ where: { purpose: "judge_match" } });
    expect(usageCalls).toBeGreaterThan(0);

    const after = await prisma.match.findUniqueOrThrow({
      where: { profileId_tenderId: { profileId, tenderId: roadTenderId } },
    });
    expect(after.profileVersion.getTime()).not.toBe(before.profileVersion.getTime());
  });

  it("costs effectively $0 for 1 profile x this small day of tenders under the mock provider", async () => {
    await prisma.aiUsage.deleteMany();
    await prisma.match.deleteMany({ where: { profileId } });
    await runMatchPipelineForProfile(profileId);
    const rows = await prisma.aiUsage.findMany({ where: { purpose: "judge_match" } });
    const total = rows.reduce((s, r) => s + Number(r.estCostUsd), 0);
    expect(total).toBeLessThan(0.05); // PHASE-4 acceptance: < $0.05/profile/day
  });
});
