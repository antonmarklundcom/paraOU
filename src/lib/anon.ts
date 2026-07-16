import { cookies } from "next/headers";

/**
 * Anonymous profile identity (PHASE-4: "profiles persist for anonymous users in
 * localStorage until Phase 5 auth, then migrate"). In practice the profile ROW
 * lives in Postgres from the start — the worker's batch matching pipeline needs a
 * durable server-side row to score against, not something that only exists in the
 * browser. What's "anonymous" is the identity: a random token in an httpOnly
 * cookie, generated on first profile save, with no email/account attached. Phase 5
 * migrates it by setting `CompanyProfile.userId` once the visitor signs in.
 */
export const ANON_COOKIE = "paraou_anon";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** Read-only: use in Server Components / GET handlers. Null if never set. */
export async function readAnonId(): Promise<string | null> {
  const store = await cookies();
  return store.get(ANON_COOKIE)?.value ?? null;
}

/** Read the existing id or mint a new one. Only call from a Route Handler / Server
 * Action (needs write access to cookies); returns the id and whether it's new. */
export async function getOrCreateAnonId(): Promise<{ id: string; created: boolean }> {
  const store = await cookies();
  const existing = store.get(ANON_COOKIE)?.value;
  if (existing) return { id: existing, created: false };
  const id = crypto.randomUUID();
  store.set(ANON_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR,
    path: "/",
  });
  return { id, created: true };
}
