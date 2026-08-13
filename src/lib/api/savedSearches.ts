import type { SavedSearch } from "@prisma/client";
import { z } from "zod";
import { auth } from "../auth.js";
import { prisma } from "../db.js";
import { ApiError } from "./http.js";

/**
 * Saved searches (PHASE-5 #2): "Guardar búsqueda" from /licitaciones serializes
 * filter state → SavedSearch; managed (rename, toggle alert, delete) from /panel.
 * Requires a signed-in user — no anonymous equivalent (unlike CompanyProfile).
 *
 * Phase F2 (multi-profile): each search is scoped to the account's *active*
 * CompanyProfile (nullable — pre-F2 rows and accounts with no profile yet stay
 * `profileId: null`, i.e. account-wide).
 */

export const savedSearchBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Raw query-string params from /licitaciones — validated on read (tenderQuerySchema)
  // when the alert job actually runs the search, not here (params may predate a
  // schema change; keep saves permissive).
  params: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
});

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return session.user.id;
}

export async function listSavedSearches(
  userId: string,
  profileId: string | null,
): Promise<SavedSearch[]> {
  return prisma.savedSearch.findMany({
    where: { userId, profileId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSavedSearch(
  userId: string,
  profileId: string | null,
  body: z.infer<typeof savedSearchBodySchema>,
): Promise<SavedSearch> {
  return prisma.savedSearch.create({
    data: { userId, profileId, name: body.name, params: body.params },
  });
}

async function requireOwned(userId: string, id: string): Promise<SavedSearch> {
  const search = await prisma.savedSearch.findUnique({ where: { id } });
  if (!search || search.userId !== userId) {
    throw new ApiError(404, "SAVED_SEARCH_NOT_FOUND", "No saved search with this id");
  }
  return search;
}

export async function updateSavedSearch(
  userId: string,
  id: string,
  data: { name?: string; alerting?: boolean },
): Promise<SavedSearch> {
  await requireOwned(userId, id);
  return prisma.savedSearch.update({ where: { id }, data });
}

export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  await requireOwned(userId, id);
  await prisma.savedSearch.delete({ where: { id } });
}

export function publicSavedSearch(s: SavedSearch) {
  return {
    id: s.id,
    name: s.name,
    params: s.params,
    alerting: s.alerting,
    createdAt: s.createdAt.toISOString(),
  };
}
