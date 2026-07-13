import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../db.js";

/** PHASE-6 #1: signed-in users are capped at limitsFor(plan).maxProfiles. */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

let mockUserId = "";
let mockPlan = "FREE";

vi.mock("../../auth.js", () => ({
  auth: async () =>
    mockUserId ? { user: { id: mockUserId, plan: mockPlan, email: "x@example.com" } } : null,
}));

const { createProfile } = await import("../profiles.js");

const BODY = {
  name: "Empresa",
  description: "Descripción de al menos diez caracteres",
  categoryCodes: [],
  keywords: [],
  excludeKeywords: [],
  departments: [],
  amountMin: null,
  amountMax: null,
  certifications: [],
};

describe.skipIf(!hasDb)("createProfile plan limit (integration)", () => {
  beforeAll(async () => {
    await prisma.match.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.user.deleteMany();
  });
  beforeEach(async () => {
    await prisma.match.deleteMany();
    await prisma.companyProfile.deleteMany();
    await prisma.user.deleteMany();
    mockUserId = "";
    mockPlan = "FREE";
  });

  it("anonymous visitors are never limited", async () => {
    const a = await createProfile(BODY);
    const b = await createProfile(BODY);
    expect(a.id).not.toBe(b.id);
    expect(a.userId).toBeNull();
  });

  it("FREE user is blocked from creating a second profile", async () => {
    const user = await prisma.user.create({ data: { email: "free@example.com" } });
    mockUserId = user.id;
    mockPlan = "FREE";

    await createProfile(BODY);
    await expect(createProfile(BODY)).rejects.toThrow(/plan allows/i);
    expect(await prisma.companyProfile.count({ where: { userId: user.id } })).toBe(1);
  });

  it("BUSINESS user can create up to 3 profiles, blocked on the 4th", async () => {
    const user = await prisma.user.create({ data: { email: "biz@example.com", plan: "BUSINESS" } });
    mockUserId = user.id;
    mockPlan = "BUSINESS";

    await createProfile(BODY);
    await createProfile(BODY);
    await createProfile(BODY);
    await expect(createProfile(BODY)).rejects.toThrow(/plan allows/i);
    expect(await prisma.companyProfile.count({ where: { userId: user.id } })).toBe(3);
  });
});
