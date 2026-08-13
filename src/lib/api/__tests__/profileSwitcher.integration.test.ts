import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../db.js";

/**
 * Phase F2 (multi-profile switcher): `resolveActiveProfileId` picks the right
 * profile from the `x-profile-id` header, `requireProfile` honors it end to
 * end, and `deleteProfile` refuses to leave an account with zero profiles.
 */
const hasDb = Boolean(process.env.DATABASE_URL) && process.env.SKIP_DB_TESTS !== "1";

let mockUserId = "";

vi.mock("../../auth.js", () => ({
  auth: async () =>
    mockUserId ? { user: { id: mockUserId, plan: "BUSINESS", email: "x@example.com" } } : null,
}));

const { resolveActiveProfileId, requireProfile, listProfiles, deleteProfile } = await import(
  "../profiles.js"
);

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://example.com/api/profile", { headers });
}

async function resetAll() {
  await prisma.savedSearch.deleteMany();
  await prisma.followedTender.deleteMany();
  await prisma.match.deleteMany();
  await prisma.companyProfile.deleteMany();
  await prisma.user.deleteMany();
}

describe.skipIf(!hasDb)("multi-profile switcher (integration)", () => {
  beforeAll(resetAll);
  beforeEach(async () => {
    await resetAll();
    mockUserId = "";
  });

  describe("resolveActiveProfileId", () => {
    it("returns null for a user with no profiles yet", async () => {
      const user = await prisma.user.create({ data: { email: "none@example.com" } });
      expect(await resolveActiveProfileId(user.id, reqWith({}))).toBeNull();
    });

    it("defaults to the oldest profile when no header is sent", async () => {
      const user = await prisma.user.create({ data: { email: "default@example.com" } });
      const first = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Primero", description: "Primer perfil de la cuenta" },
      });
      await prisma.companyProfile.create({
        data: { userId: user.id, name: "Segundo", description: "Segundo perfil de la cuenta" },
      });
      expect(await resolveActiveProfileId(user.id, reqWith({}))).toBe(first.id);
    });

    it("honors x-profile-id when it belongs to the user", async () => {
      const user = await prisma.user.create({ data: { email: "switch@example.com" } });
      await prisma.companyProfile.create({
        data: { userId: user.id, name: "Primero", description: "Primer perfil de la cuenta" },
      });
      const second = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Segundo", description: "Segundo perfil de la cuenta" },
      });
      const active = await resolveActiveProfileId(
        user.id,
        reqWith({ "x-profile-id": second.id }),
      );
      expect(active).toBe(second.id);
    });

    it("ignores an x-profile-id that belongs to another account", async () => {
      const user = await prisma.user.create({ data: { email: "victim@example.com" } });
      const own = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Mío", description: "Perfil propio de esta cuenta" },
      });
      const other = await prisma.user.create({ data: { email: "attacker@example.com" } });
      const otherProfile = await prisma.companyProfile.create({
        data: { userId: other.id, name: "Ajeno", description: "Perfil de otra cuenta distinta" },
      });
      const active = await resolveActiveProfileId(
        user.id,
        reqWith({ "x-profile-id": otherProfile.id }),
      );
      expect(active).toBe(own.id); // never leaks another account's profile
    });
  });

  describe("requireProfile", () => {
    it("resolves the switcher-selected profile for a signed-in multi-profile user", async () => {
      const user = await prisma.user.create({ data: { email: "req@example.com" } });
      mockUserId = user.id;
      await prisma.companyProfile.create({
        data: { userId: user.id, name: "Primero", description: "Primer perfil de la cuenta" },
      });
      const second = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Segundo", description: "Segundo perfil de la cuenta" },
      });

      const resolved = await requireProfile(reqWith({ "x-profile-id": second.id }));
      expect(resolved.id).toBe(second.id);
    });
  });

  describe("deleteProfile", () => {
    it("deletes one of several profiles", async () => {
      const user = await prisma.user.create({ data: { email: "del1@example.com" } });
      const a = await prisma.companyProfile.create({
        data: { userId: user.id, name: "A", description: "Perfil A de la cuenta de prueba" },
      });
      await prisma.companyProfile.create({
        data: { userId: user.id, name: "B", description: "Perfil B de la cuenta de prueba" },
      });

      await deleteProfile(user.id, a.id);
      const remaining = await listProfiles(user.id);
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.name).toBe("B");
    });

    it("refuses to delete an account's only profile", async () => {
      const user = await prisma.user.create({ data: { email: "del2@example.com" } });
      const only = await prisma.companyProfile.create({
        data: { userId: user.id, name: "Único", description: "El único perfil de esta cuenta" },
      });
      await expect(deleteProfile(user.id, only.id)).rejects.toThrow(/only company profile/i);
      expect(await prisma.companyProfile.count({ where: { userId: user.id } })).toBe(1);
    });

    it("refuses to delete a profile owned by someone else", async () => {
      const owner = await prisma.user.create({ data: { email: "owner@example.com" } });
      const profile = await prisma.companyProfile.create({
        data: { userId: owner.id, name: "Suyo", description: "Perfil que pertenece al dueño" },
      });
      // A second profile so the "last profile" guard isn't what blocks this.
      await prisma.companyProfile.create({
        data: { userId: owner.id, name: "Otro", description: "Otro perfil del mismo dueño" },
      });
      const stranger = await prisma.user.create({ data: { email: "stranger@example.com" } });

      await expect(deleteProfile(stranger.id, profile.id)).rejects.toThrow(
        /no profile with this id/i,
      );
      expect(await prisma.companyProfile.count({ where: { id: profile.id } })).toBe(1);
    });

    it("cascade-deletes the profile's saved searches and follows", async () => {
      const user = await prisma.user.create({ data: { email: "cascade@example.com" } });
      const a = await prisma.companyProfile.create({
        data: { userId: user.id, name: "A", description: "Perfil A de la cuenta de prueba" },
      });
      await prisma.companyProfile.create({
        data: { userId: user.id, name: "B", description: "Perfil B de la cuenta de prueba" },
      });
      const tender = await prisma.tender.create({
        data: { ocid: "f2-cascade-1", title: "Obra", status: "OPEN", currency: "PYG", raw: {} },
      });
      await prisma.savedSearch.create({
        data: { userId: user.id, profileId: a.id, name: "Búsqueda A", params: {} },
      });
      await prisma.followedTender.create({
        data: { userId: user.id, profileId: a.id, tenderId: tender.id },
      });

      await deleteProfile(user.id, a.id);

      expect(await prisma.savedSearch.count({ where: { profileId: a.id } })).toBe(0);
      expect(await prisma.followedTender.count({ where: { profileId: a.id } })).toBe(0);
    });
  });
});
