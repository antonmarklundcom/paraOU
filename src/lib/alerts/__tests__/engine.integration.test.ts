import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db.js";
import { collectAlertCandidates } from "../collect.js";
import { sendDigestForUser } from "../engine.js";

/**
 * Integration tests for the alert engine (PHASE-5 #3 acceptance): candidate
 * collection from all three sources, and the AlertLog dedupe — "seed a new
 * matching tender → next digest run emails exactly one alert; re-running sends
 * nothing." No RESEND_API_KEY in CI, so sendEmail uses the dev (log-only)
 * transport — no network calls, safe to run here.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";
const day = 24 * 3600_000;

async function resetAll() {
  await prisma.alertLog.deleteMany();
  await prisma.followedTender.deleteMany();
  await prisma.match.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.savedSearch.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenderEvent.deleteMany();
  await prisma.award.deleteMany();
  await prisma.tender.deleteMany();
}

async function seedUser(overrides: Partial<Parameters<typeof prisma.user.create>[0]["data"]> = {}) {
  return prisma.user.create({
    data: { email: `u-${Math.random().toString(36).slice(2)}@example.com`, ...overrides },
  });
}

async function seedTender(
  overrides: Partial<Parameters<typeof prisma.tender.create>[0]["data"]> = {},
) {
  return prisma.tender.create({
    data: {
      ocid: `alert-${Math.random().toString(36).slice(2)}`,
      title: "Construcción de empedrado en Itapúa",
      status: "OPEN",
      department: "Itapúa",
      currency: "PYG",
      deadlineAt: new Date(Date.now() + 15 * day),
      raw: {},
      ...overrides,
    },
  });
}

describe.skipIf(!hasDb)("alert engine (integration)", () => {
  beforeAll(resetAll);
  beforeEach(resetAll);

  describe("collectAlertCandidates", () => {
    it("picks up tenders matching an alerting saved search", async () => {
      const user = await seedUser();
      const tender = await seedTender();
      await prisma.savedSearch.create({
        data: {
          userId: user.id,
          name: "Obras Itapúa",
          params: { department: "Itapúa" },
          alerting: true,
        },
      });

      const candidates = await collectAlertCandidates(user.id);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.tenderId).toBe(tender.id);
      expect(candidates[0]?.reason).toBe("saved_search");
    });

    it("ignores saved searches with alerting disabled", async () => {
      const user = await seedUser();
      await seedTender();
      await prisma.savedSearch.create({
        data: { userId: user.id, name: "Off", params: { department: "Itapúa" }, alerting: false },
      });
      expect(await collectAlertCandidates(user.id)).toHaveLength(0);
    });

    it("includes matches at or above the alert threshold, excludes dismissed", async () => {
      const user = await seedUser();
      const profile = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Empresa", description: "Obras viales" },
      });
      const strong = await seedTender();
      const weak = await seedTender();
      const dismissed = await seedTender();
      await prisma.match.create({
        data: {
          profileId: profile.id,
          tenderId: strong.id,
          score: 85,
          verdict: "STRONG",
          fitReasons: [],
          cautions: [],
          profileVersion: 1,
          tenderVersion: 1,
        },
      });
      await prisma.match.create({
        data: {
          profileId: profile.id,
          tenderId: weak.id,
          score: 55, // below ALERT_MIN_MATCH_SCORE (70)
          verdict: "POSSIBLE",
          fitReasons: [],
          cautions: [],
          profileVersion: 1,
          tenderVersion: 1,
        },
      });
      await prisma.match.create({
        data: {
          profileId: profile.id,
          tenderId: dismissed.id,
          score: 90,
          verdict: "STRONG",
          fitReasons: [],
          cautions: [],
          profileVersion: 1,
          tenderVersion: 1,
          userAction: "DISMISSED",
        },
      });

      const candidates = await collectAlertCandidates(user.id);
      expect(candidates.map((c) => c.tenderId)).toEqual([strong.id]);
      expect(candidates[0]?.reason).toBe("match");
    });

    it("flags followed tenders that changed status after the follow was created", async () => {
      const user = await seedUser();
      const tender = await seedTender();
      const follow = await prisma.followedTender.create({
        data: { userId: user.id, tenderId: tender.id },
      });
      // Event before the follow: must NOT trigger an alert.
      await prisma.tenderEvent.create({
        data: {
          tenderId: tender.id,
          type: "STATUS_CHANGE",
          newValue: "OPEN",
          createdAt: new Date(follow.createdAt.getTime() - day),
        },
      });
      let candidates = await collectAlertCandidates(user.id);
      expect(candidates).toHaveLength(0);

      // Event after the follow: must trigger.
      await prisma.tenderEvent.create({
        data: {
          tenderId: tender.id,
          type: "DEADLINE_CHANGE",
          newValue: new Date(Date.now() + 20 * day).toISOString(),
          createdAt: new Date(follow.createdAt.getTime() + 1000),
        },
      });
      candidates = await collectAlertCandidates(user.id);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.reason).toBe("tender_changed");
    });

    it("dedupes the same tender surfaced by multiple sources, preferring the specific reason", async () => {
      const user = await seedUser();
      const profile = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Empresa", description: "Obras viales" },
      });
      const tender = await seedTender();
      await prisma.savedSearch.create({
        data: { userId: user.id, name: "Obras", params: { department: "Itapúa" }, alerting: true },
      });
      await prisma.match.create({
        data: {
          profileId: profile.id,
          tenderId: tender.id,
          score: 90,
          verdict: "STRONG",
          fitReasons: [],
          cautions: [],
          profileVersion: 1,
          tenderVersion: 1,
        },
      });

      const candidates = await collectAlertCandidates(user.id);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.reason).toBe("match");
    });
  });

  describe("sendDigestForUser + AlertLog dedupe", () => {
    it("sends once, logs, and sends nothing on the next run for the same tender", async () => {
      const user = await seedUser({ alertChannel: "EMAIL", alertFrequency: "DAILY" });
      await seedTender();
      await prisma.savedSearch.create({
        data: { userId: user.id, name: "Obras", params: { department: "Itapúa" }, alerting: true },
      });

      const first = await sendDigestForUser(user.id);
      expect(first.sent).toBe(true);
      expect(first.itemCount).toBe(1);
      expect(await prisma.alertLog.count({ where: { userId: user.id } })).toBe(1);

      const second = await sendDigestForUser(user.id);
      expect(second.sent).toBe(false);
      expect(second.itemCount).toBe(0);
      expect(await prisma.alertLog.count({ where: { userId: user.id } })).toBe(1);
    });

    it("skips users with alertChannel NONE", async () => {
      const user = await seedUser({ alertChannel: "NONE" });
      await seedTender();
      await prisma.savedSearch.create({
        data: { userId: user.id, name: "Obras", params: { department: "Itapúa" }, alerting: true },
      });
      const result = await sendDigestForUser(user.id);
      expect(result.sent).toBe(false);
    });

    it("skips users with a bounced email address", async () => {
      const user = await seedUser({ alertChannel: "EMAIL", emailBounced: true });
      await seedTender();
      await prisma.savedSearch.create({
        data: { userId: user.id, name: "Obras", params: { department: "Itapúa" }, alerting: true },
      });
      const result = await sendDigestForUser(user.id);
      expect(result.sent).toBe(false);
    });
  });
});
