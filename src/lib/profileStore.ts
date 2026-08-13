/**
 * Anonymous profile credential in the browser (PHASE-4: profiles persist for
 * anonymous users in localStorage until Phase 5 auth, then migrate). Only the
 * token is stored client-side; the profile itself lives in Postgres.
 *
 * Phase F2 adds a second, independent credential: which of the signed-in
 * account's CompanyProfiles is currently selected in the /perfil + /panel
 * switcher. Both are sent as headers on every `profileFetch` call; the server
 * only ever trusts the active-profile id after checking it belongs to the
 * session's own account (see `resolveActiveProfileId`).
 */

const TOKEN_KEY = "paraou:profileToken";
const ACTIVE_KEY = "paraou:activeProfileId";

export function getProfileToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setProfileToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode — profile works for the session via state only */
  }
}

export function getActiveProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProfileId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* private mode — switcher still works for the current page load via state */
  }
}

export function clearActiveProfileId(): void {
  try {
    localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

export async function profileFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getProfileToken();
  const activeProfileId = getActiveProfileId();
  return fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-profile-token": token } : {}),
      ...(activeProfileId ? { "x-profile-id": activeProfileId } : {}),
      ...(init.headers ?? {}),
    },
  });
}
