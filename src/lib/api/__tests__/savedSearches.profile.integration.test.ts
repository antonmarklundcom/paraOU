import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../db.js";

// savedSearches.ts imports `auth` from next-auth at module load time; mock it
// (same pattern as profileLimit.integration.test.ts) so this suite doesn't
// need a real Auth.js/Next.js server runtime.
vi.mock("../../auth.js", () => ({ auth: async () => null }));

const { createSavedSearch, listSavedSearches } = await import("../savedSearches.js");

/**
 * Phase F2: saved searches are scoped to whichever CompanyProfile they were
 * saved under, so a multi-profile account's BUSINESS/AGENCY switcher sees a
 * different list per profile instead of one account-wide list.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

async function resetAll() {
  await prisma.savedSearch.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.user.deleteMany();
}

describe.skipIf(!hasDb)("saved searches — profile scoping (integration)", () => {
  beforeAll(resetAll);
  beforeEach(resetAll);

  it("keeps each profile's saved searches separate", async () => {
    const user = await prisma.user.create({ data: { email: "ss1@example.com", plan: "BUSINESS" } });
    const profileA = await prisma.companyProfile.create({
      data: { userId: user.id, name: "A", description: "Perfil A de la empresa" },
    });
    const profileB = await prisma.companyProfile.create({
      data: { userId: user.id, name: "B", description: "Perfil B de la empresa" },
    });

    await createSavedSearch(user.id, profileA.id, { name: "Búsqueda A", params: {} });
    await createSavedSearch(user.id, profileB.id, { name: "Búsqueda B", params: {} });

    const forA = await listSavedSearches(user.id, profileA.id);
    const forB = await listSavedSearches(user.id, profileB.id);
    expect(forA.map((s) => s.name)).toEqual(["Búsqueda A"]);
    expect(forB.map((s) => s.name)).toEqual(["Búsqueda B"]);
  });

  it("treats pre-F2 rows (profileId null) as their own account-wide bucket", async () => {
    const user = await prisma.user.create({ data: { email: "ss2@example.com" } });
    await prisma.savedSearch.create({
      data: { userId: user.id, name: "Legado", params: {} }, // profileId defaults to null
    });
    const list = await listSavedSearches(user.id, null);
    expect(list.map((s) => s.name)).toEqual(["Legado"]);
  });
});
