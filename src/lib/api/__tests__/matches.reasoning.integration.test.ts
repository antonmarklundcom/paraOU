import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db.js";
import { getMatchFeed } from "../matches.js";

/** PHASE-6 #1: "matches visible but reasoning blurred beyond top 3/day" for FREE. */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";
const day = 24 * 3600_000;

async function seedMatches(n: number) {
  const profile = await prisma.companyProfile.create({
    data: { name: "Empresa", description: "Obras viales en Itapúa" },
  });
  for (let i = 0; i < n; i++) {
    const tender = await prisma.tender.create({
      data: {
        ocid: `reason-${profile.id}-${i}`,
        title: `Obra ${i}`,
        status: "OPEN",
        currency: "PYG",
        deadlineAt: new Date(Date.now() + 20 * day),
        raw: {},
      },
    });
    await prisma.match.create({
      data: {
        profileId: profile.id,
        tenderId: tender.id,
        score: 90 - i, // descending, so order is deterministic
        verdict: "STRONG",
        fitReasons: [`reason ${i}`],
        cautions: [],
        profileVersion: 1,
        tenderVersion: 1,
      },
    });
  }
  return profile;
}

describe.skipIf(!hasDb)("getMatchFeed reasoning visibility (integration)", () => {
  beforeAll(async () => {
    await prisma.match.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.tenderEvent.deleteMany();
    await prisma.award.deleteMany();
    await prisma.tender.deleteMany();
  });
  beforeEach(async () => {
    await prisma.match.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.tenderEvent.deleteMany();
    await prisma.award.deleteMany();
    await prisma.tender.deleteMany();
  });

  it("FREE: only the top 3 matches by score show fitReasons; score always shows", async () => {
    const profile = await seedMatches(5);
    const feed = await getMatchFeed(profile.id, "FREE");
    const all = [...feed.nuevos, ...feed.cierranPronto, ...feed.guardados].sort(
      (a, b) => b.score - a.score,
    );
    expect(all).toHaveLength(5);
    expect(all.slice(0, 3).every((m) => m.reasoningVisible && m.fitReasons.length > 0)).toBe(true);
    expect(all.slice(3).every((m) => !m.reasoningVisible && m.fitReasons.length === 0)).toBe(true);
    // Score/verdict are never gated — only the written-out reasoning is.
    expect(all.every((m) => typeof m.score === "number" && m.verdict)).toBe(true);
  });

  it("PRO: every match shows full reasoning", async () => {
    const profile = await seedMatches(5);
    const feed = await getMatchFeed(profile.id, "PRO");
    const all = [...feed.nuevos, ...feed.cierranPronto, ...feed.guardados];
    expect(all.every((m) => m.reasoningVisible && m.fitReasons.length > 0)).toBe(true);
  });

  it("defaults to FREE gating when no plan is passed (anonymous visitor)", async () => {
    const profile = await seedMatches(4);
    const feed = await getMatchFeed(profile.id);
    const all = [...feed.nuevos, ...feed.cierranPronto, ...feed.guardados];
    expect(all.filter((m) => m.reasoningVisible)).toHaveLength(3);
  });
});
