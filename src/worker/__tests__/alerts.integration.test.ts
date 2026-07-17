import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../lib/db.js";
import { readLastDevEmail } from "../../lib/email/transport.js";
import { runAlertEngine } from "../alerts.js";

const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

/**
 * Integration test against Postgres, running on the dev-outbox email transport (no
 * RESEND_API_KEY in this environment — see docs/06 verification log). Exercises the
 * PHASE-5 acceptance criteria directly:
 *   - a new matching tender produces exactly one alert on the next run
 *   - re-running (no new items) sends nothing (AlertLog dedupe)
 *   - deleting the account removes user, profiles, matches, alert logs
 */
describe.skipIf(!hasDb)("alert engine (integration)", () => {
  let userId: string;
  let profileId: string;
  let tenderId: string;

  beforeEach(async () => {
    // Clean slate every test — order matters for FK constraints.
    await prisma.alertLog.deleteMany();
    await prisma.follow.deleteMany();
    await prisma.savedSearch.deleteMany();
    await prisma.match.deleteMany();
    await prisma.session.deleteMany();
    await prisma.account.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenderEvent.deleteMany();
    await prisma.tender.deleteMany();

    const user = await prisma.user.create({
      data: {
        email: `alerttest-${Date.now()}@example.com`,
        alertChannel: "EMAIL",
        alertFrequency: "INSTANT", // always due, so a single run is deterministic
      },
    });
    userId = user.id;

    const profile = await prisma.companyProfile.create({
      data: { userId, name: "Test Co", description: "test", certifications: [] },
    });
    profileId = profile.id;

    const tender = await prisma.tender.create({
      data: {
        ocid: "alert-t-1",
        title: "Adquisición de prueba",
        status: "OPEN",
        currency: "PYG",
        deadlineAt: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
        raw: {},
      },
    });
    tenderId = tender.id;
  });

  it("emails exactly one alert for a new high-scoring match, then sends nothing on re-run", async () => {
    await prisma.match.create({
      data: {
        profileId,
        tenderId,
        score: 85,
        verdict: "strong",
        reasoning: "Buen ajuste.",
        cautions: [],
        profileVersion: (
          await prisma.companyProfile.findUniqueOrThrow({ where: { id: profileId } })
        ).updatedAt,
        tenderVersion: (await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } }))
          .updatedAt,
      },
    });

    const first = await runAlertEngine(prisma);
    expect(first.digestsSent).toBe(1);

    const alertLogCount = await prisma.alertLog.count({
      where: { userId, tenderId, channel: "EMAIL" },
    });
    expect(alertLogCount).toBe(1);

    const email = await readLastDevEmail();
    expect(email).not.toBeNull();
    expect(String(email!.subject)).toContain("licitación nueva");
    expect(String(email!.html)).toContain("Adquisición de prueba");
    expect((email!.headers as Record<string, string>)["List-Unsubscribe"]).toBeTruthy();

    // Re-run: nothing new, dedupe via AlertLog must send zero emails.
    const second = await runAlertEngine(prisma);
    expect(second.digestsSent).toBe(0);
    const alertLogCountAfter = await prisma.alertLog.count({
      where: { userId, tenderId, channel: "EMAIL" },
    });
    expect(alertLogCountAfter).toBe(1); // still exactly one, not duplicated
  });

  it("does not alert a low-scoring match (below ALERT_THRESHOLD)", async () => {
    await prisma.match.create({
      data: {
        profileId,
        tenderId,
        score: 40,
        verdict: "weak",
        reasoning: "Ajuste débil.",
        cautions: [],
        profileVersion: (
          await prisma.companyProfile.findUniqueOrThrow({ where: { id: profileId } })
        ).updatedAt,
        tenderVersion: (await prisma.tender.findUniqueOrThrow({ where: { id: tenderId } }))
          .updatedAt,
      },
    });
    const result = await runAlertEngine(prisma);
    expect(result.digestsSent).toBe(0);
  });

  it("alerts on a saved-search hit even without a Match row", async () => {
    await prisma.savedSearch.create({
      data: { profileId, name: "Todo abierto", params: { status: ["OPEN"] }, alerting: true },
    });
    const result = await runAlertEngine(prisma);
    expect(result.digestsSent).toBe(1);
    const email = await readLastDevEmail();
    expect(String(email!.html)).toContain("búsqueda guardada");
  });

  it("does not alert from a muted (alerting: false) saved search", async () => {
    await prisma.savedSearch.create({
      data: { profileId, name: "Muted", params: { status: ["OPEN"] }, alerting: false },
    });
    const result = await runAlertEngine(prisma);
    expect(result.digestsSent).toBe(0);
  });

  it("alerts on a status change to a followed tender", async () => {
    await prisma.follow.create({ data: { userId, tenderId } });
    await prisma.tenderEvent.create({
      data: {
        tenderId,
        type: "STATUS_CHANGE",
        field: "status",
        oldValue: "OPEN",
        newValue: "AWARDED",
      },
    });
    const result = await runAlertEngine(prisma);
    expect(result.digestsSent).toBe(1);
    const email = await readLastDevEmail();
    expect(String(email!.html)).toContain("seguís");
  });

  it("respects alertFrequency=NONE (muted users are never due)", async () => {
    await prisma.user.update({ where: { id: userId }, data: { alertFrequency: "NONE" } });
    await prisma.match.create({
      data: {
        profileId,
        tenderId,
        score: 90,
        verdict: "strong",
        reasoning: "x",
        cautions: [],
        profileVersion: new Date(),
        tenderVersion: new Date(),
      },
    });
    const result = await runAlertEngine(prisma);
    expect(result.usersDue).toBe(0);
    expect(result.digestsSent).toBe(0);
  });

  it("respects alertChannel=NONE", async () => {
    await prisma.user.update({ where: { id: userId }, data: { alertChannel: "NONE" } });
    const result = await runAlertEngine(prisma);
    expect(result.usersDue).toBe(0);
  });

  it("DAILY frequency is not due again within 24h", async () => {
    await prisma.user.update({
      where: { id: userId },
      data: { alertFrequency: "DAILY", lastDigestAt: new Date() },
    });
    const result = await runAlertEngine(prisma);
    expect(result.usersDue).toBe(0);
  });

  it("caps a digest at 10 items and leaves the rest for the next run", async () => {
    const tenders = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        prisma.tender.create({
          data: {
            ocid: `alert-cap-${i}`,
            title: `Licitación ${i}`,
            status: "OPEN",
            currency: "PYG",
            raw: {},
          },
        }),
      ),
    );
    const profile = await prisma.companyProfile.findUniqueOrThrow({ where: { id: profileId } });
    for (const t of tenders) {
      await prisma.match.create({
        data: {
          profileId,
          tenderId: t.id,
          score: 90,
          verdict: "strong",
          reasoning: "x",
          cautions: [],
          profileVersion: profile.updatedAt,
          tenderVersion: t.updatedAt,
        },
      });
    }

    const first = await runAlertEngine(prisma);
    expect(first.digestsSent).toBe(1);
    const afterFirst = await prisma.alertLog.count({ where: { userId, channel: "EMAIL" } });
    expect(afterFirst).toBe(10);

    // Overflow (2 remaining) rolls into the next due run.
    await prisma.user.update({ where: { id: userId }, data: { alertFrequency: "INSTANT" } });
    const second = await runAlertEngine(prisma);
    expect(second.digestsSent).toBe(1);
    const afterSecond = await prisma.alertLog.count({ where: { userId, channel: "EMAIL" } });
    expect(afterSecond).toBe(12);

    const third = await runAlertEngine(prisma);
    expect(third.digestsSent).toBe(0);
  });
});

describe.skipIf(!hasDb)("account deletion cascade (PHASE-5 acceptance)", () => {
  it("deleting the user removes profiles, matches, saved searches, follows, alert log", async () => {
    const user = await prisma.user.create({ data: { email: `del-${Date.now()}@example.com` } });
    const profile = await prisma.companyProfile.create({
      data: { userId: user.id, name: "Del Co", description: "x", certifications: [] },
    });
    const tender = await prisma.tender.create({
      data: { ocid: `del-t-${Date.now()}`, title: "x", status: "OPEN", currency: "PYG", raw: {} },
    });
    await prisma.match.create({
      data: {
        profileId: profile.id,
        tenderId: tender.id,
        score: 80,
        verdict: "strong",
        reasoning: "x",
        cautions: [],
        profileVersion: profile.updatedAt,
        tenderVersion: tender.updatedAt,
      },
    });
    await prisma.savedSearch.create({ data: { profileId: profile.id, name: "s", params: {} } });
    await prisma.follow.create({ data: { userId: user.id, tenderId: tender.id } });
    await prisma.alertLog.create({
      data: { userId: user.id, tenderId: tender.id, channel: "EMAIL" },
    });

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.companyProfile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await prisma.match.findFirst({ where: { profileId: profile.id } })).toBeNull();
    expect(await prisma.savedSearch.findFirst({ where: { profileId: profile.id } })).toBeNull();
    expect(await prisma.follow.findFirst({ where: { userId: user.id } })).toBeNull();
    expect(await prisma.alertLog.findFirst({ where: { userId: user.id } })).toBeNull();
    // The tender itself must survive — only the user's own data is wiped.
    expect(await prisma.tender.findUnique({ where: { id: tender.id } })).not.toBeNull();
  });
});
