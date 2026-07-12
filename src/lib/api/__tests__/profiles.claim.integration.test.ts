import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db.js";
import { claimAnonymousProfile } from "../profiles.js";

/** PHASE-5 #1: "on first login, migrate the anonymous localStorage profile into the DB." */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

async function resetAll() {
  await prisma.match.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.user.deleteMany();
}

describe.skipIf(!hasDb)("claimAnonymousProfile (integration)", () => {
  beforeAll(resetAll);
  beforeEach(resetAll);

  it("attaches an unclaimed anonymous profile to the user", async () => {
    const user = await prisma.user.create({ data: { email: "claim1@example.com" } });
    const anon = await prisma.companyProfile.create({
      data: { name: "Empresa", description: "Obras viales en Itapúa hasta Gs. 5000 millones" },
    });

    const claimed = await claimAnonymousProfile(user.id, anon.anonToken);
    expect(claimed?.id).toBe(anon.id);

    const reloaded = await prisma.companyProfile.findUniqueOrThrow({ where: { id: anon.id } });
    expect(reloaded.userId).toBe(user.id);
  });

  it("no-ops for an unknown token", async () => {
    const user = await prisma.user.create({ data: { email: "claim2@example.com" } });
    expect(await claimAnonymousProfile(user.id, "not-a-real-token")).toBeNull();
  });

  it("never overwrites a profile the user already owns", async () => {
    const user = await prisma.user.create({ data: { email: "claim3@example.com" } });
    const owned = await prisma.companyProfile.create({
      data: { userId: user.id, name: "Ya tengo", description: "Perfil existente del usuario" },
    });
    const otherAnon = await prisma.companyProfile.create({
      data: { name: "Otro", description: "Otro perfil anónimo distinto de este usuario" },
    });

    const result = await claimAnonymousProfile(user.id, otherAnon.anonToken);
    expect(result?.id).toBe(owned.id); // returns the already-owned one, untouched

    const stillUnclaimed = await prisma.companyProfile.findUniqueOrThrow({
      where: { id: otherAnon.id },
    });
    expect(stillUnclaimed.userId).toBeNull();
  });

  it("never re-claims a profile already owned by someone else", async () => {
    const owner = await prisma.user.create({ data: { email: "claim4-owner@example.com" } });
    const thief = await prisma.user.create({ data: { email: "claim4-thief@example.com" } });
    const profile = await prisma.companyProfile.create({
      data: {
        userId: owner.id,
        name: "Del dueño",
        description: "Perfil que ya pertenece a alguien",
      },
    });

    const result = await claimAnonymousProfile(thief.id, profile.anonToken);
    expect(result).toBeNull();

    const reloaded = await prisma.companyProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(reloaded.userId).toBe(owner.id);
  });
});
