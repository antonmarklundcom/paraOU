import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../db.js";
import { isFollowing, toggleFollow } from "../follow.js";

/**
 * Phase F2: follows are scoped to whichever CompanyProfile was active when the
 * 🔔 was toggled, so a multi-profile account's follows don't bleed across
 * profiles.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

async function resetAll() {
  await prisma.followedTender.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tender.deleteMany();
}

describe.skipIf(!hasDb)("follows — profile scoping (integration)", () => {
  beforeAll(resetAll);
  beforeEach(resetAll);

  it("following under one profile doesn't show as followed under another", async () => {
    const user = await prisma.user.create({ data: { email: "fw1@example.com", plan: "BUSINESS" } });
    const profileA = await prisma.companyProfile.create({
      data: { userId: user.id, name: "A", description: "Perfil A de la empresa" },
    });
    const profileB = await prisma.companyProfile.create({
      data: { userId: user.id, name: "B", description: "Perfil B de la empresa" },
    });
    const tender = await prisma.tender.create({
      data: { ocid: "f2-follow-1", title: "Obra", status: "OPEN", currency: "PYG", raw: {} },
    });

    expect(await toggleFollow(user.id, profileA.id, tender.ocid)).toBe(true);
    expect(await isFollowing(user.id, profileA.id, tender.ocid)).toBe(true);
    expect(await isFollowing(user.id, profileB.id, tender.ocid)).toBe(false);
  });

  it("toggling is independent per profile", async () => {
    const user = await prisma.user.create({ data: { email: "fw2@example.com", plan: "BUSINESS" } });
    const profileA = await prisma.companyProfile.create({
      data: { userId: user.id, name: "A", description: "Perfil A de la empresa" },
    });
    const tender = await prisma.tender.create({
      data: { ocid: "f2-follow-2", title: "Obra", status: "OPEN", currency: "PYG", raw: {} },
    });

    expect(await toggleFollow(user.id, profileA.id, tender.ocid)).toBe(true);
    expect(await toggleFollow(user.id, profileA.id, tender.ocid)).toBe(false);
    expect(await isFollowing(user.id, profileA.id, tender.ocid)).toBe(false);
  });
});
