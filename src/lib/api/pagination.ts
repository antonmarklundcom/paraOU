import { ApiError } from "./http.js";

/**
 * Keyset (seek) cursor encoding. We paginate on `(sortValue, ocid)` tuples rather
 * than OFFSET so pages stay stable while new tenders are inserted concurrently
 * (PHASE-2 acceptance: "cursor pagination is stable under concurrent inserts").
 *
 * `v` is the stringified primary sort value of the last row on the page; `id` is its
 * ocid (unique tiebreaker).
 */
export interface Cursor {
  v: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.v !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error("malformed");
    }
    return { v: parsed.v, id: parsed.id };
  } catch {
    throw new ApiError(400, "BAD_CURSOR", "Invalid pagination cursor");
  }
}
