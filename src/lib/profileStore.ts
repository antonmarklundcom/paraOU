/**
 * Anonymous profile credential in the browser (PHASE-4: profiles persist for
 * anonymous users in localStorage until Phase 5 auth, then migrate). Only the
 * token is stored client-side; the profile itself lives in Postgres.
 */

const KEY = "paraou:profileToken";

export function getProfileToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setProfileToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode — profile works for the session via state only */
  }
}

export async function profileFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getProfileToken();
  return fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-profile-token": token } : {}),
      ...(init.headers ?? {}),
    },
  });
}
