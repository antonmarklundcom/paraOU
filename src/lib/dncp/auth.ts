/**
 * DNCP token manager (docs/01).
 *
 * Exchanges the long-lived request token for a short-lived access token
 * (`POST {tokenUrl}` with `Authorization: Basic <requestToken>`), caches it, and
 * refreshes proactively ~2 min before the 15-minute expiry. On a 401 the client
 * calls {@link TokenManager.invalidate} and asks for a fresh token exactly once.
 *
 * Timers and fetch are injectable so the refresh logic is unit-testable without a
 * network or real clock (PHASE-1 acceptance: "token refresh").
 */

export interface TokenManagerOptions {
  tokenUrl: string;
  invalidateUrl?: string;
  requestToken: string;
  /** Access token lifetime in ms if the response omits `expires_in`. Default 15 min. */
  defaultTtlMs?: number;
  /** Refresh this many ms before expiry. Default 2 min (→ refresh at ~13 min). */
  refreshSkewMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

interface TokenResponse {
  access_token?: string;
  accessToken?: string;
  expires_in?: number;
}

export class TokenManager {
  private readonly opts: Required<Omit<TokenManagerOptions, "invalidateUrl">> & {
    invalidateUrl?: string;
  };
  private cached: CachedToken | null = null;
  private inflight: Promise<string> | null = null;

  constructor(options: TokenManagerOptions) {
    this.opts = {
      defaultTtlMs: 15 * 60 * 1000,
      refreshSkewMs: 2 * 60 * 1000,
      fetchImpl: fetch,
      now: Date.now,
      ...options,
    };
  }

  /** Returns a valid access token, refreshing if missing or near expiry. */
  async getToken(forceRefresh = false): Promise<string> {
    const now = this.opts.now();
    if (!forceRefresh && this.cached && now < this.cached.expiresAt - this.opts.refreshSkewMs) {
      return this.cached.accessToken;
    }
    // Coalesce concurrent refreshes so a burst of callers triggers one token fetch.
    if (!this.inflight) {
      this.inflight = this.fetchToken().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /** Drop the cached token so the next {@link getToken} fetches a fresh one. */
  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    const res = await this.opts.fetchImpl(this.opts.tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.opts.requestToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await safeText(res);
      throw new Error(`DNCP token request failed: ${res.status} ${res.statusText} ${body}`);
    }
    const data = (await res.json()) as TokenResponse;
    const accessToken = data.access_token ?? data.accessToken;
    if (!accessToken) {
      throw new Error("DNCP token response missing access_token");
    }
    const ttlMs =
      typeof data.expires_in === "number" ? data.expires_in * 1000 : this.opts.defaultTtlMs;
    this.cached = {
      accessToken,
      expiresAt: this.opts.now() + ttlMs,
    };
    return accessToken;
  }

  /** Best-effort early invalidation on the server (docs/01, optional). */
  async invalidateRemote(): Promise<void> {
    if (!this.opts.invalidateUrl || !this.cached) return;
    try {
      await this.opts.fetchImpl(this.opts.invalidateUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${this.opts.requestToken}`,
          Accept: "application/json",
        },
      });
    } catch {
      // Non-fatal: the token expires on its own within 15 min.
    } finally {
      this.invalidate();
    }
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "";
  }
}
