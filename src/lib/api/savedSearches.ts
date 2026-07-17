import { z } from "zod";
import { prisma } from "../db.js";
import { ApiError } from "./http.js";

export const savedSearchInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  params: z.record(z.unknown()), // serialized /licitaciones filter state (docs/05)
});

/** "Guardar búsqueda" (docs/05 §1 — the conversion moment, gated behind signup). */
export async function createSavedSearch(
  profileId: string,
  input: z.infer<typeof savedSearchInputSchema>,
) {
  return prisma.savedSearch.create({
    data: { profileId, name: input.name, params: input.params as object },
  });
}

export async function listSavedSearches(profileId: string) {
  return prisma.savedSearch.findMany({ where: { profileId }, orderBy: { createdAt: "desc" } });
}

async function requireOwnedSavedSearch(profileId: string, id: string) {
  const search = await prisma.savedSearch.findUnique({ where: { id } });
  if (!search || search.profileId !== profileId) {
    throw new ApiError(404, "NOT_FOUND", "Saved search not found");
  }
  return search;
}

export async function updateSavedSearch(
  profileId: string,
  id: string,
  input: { name?: string; alerting?: boolean },
) {
  await requireOwnedSavedSearch(profileId, id);
  return prisma.savedSearch.update({ where: { id }, data: input });
}

export async function deleteSavedSearch(profileId: string, id: string) {
  await requireOwnedSavedSearch(profileId, id);
  await prisma.savedSearch.delete({ where: { id } });
}
