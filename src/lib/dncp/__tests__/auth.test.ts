import { describe, it, expect } from "vitest";
import { TokenManager } from "../auth.js";

function makeFetch(tokens: string[], expiresIn = 900) {
  let calls = 0;
  const impl = (async () => {
    const token = tokens[Math.min(calls, tokens.length - 1)];
    calls++;
    return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    impl,
    get calls() {
      return calls;
    },
  };
}

describe("TokenManager", () => {
  it("fetches once and caches within the token lifetime", async () => {
    const fetchImpl = makeFetch(["tok-1"]);
    let now = 0;
    const tm = new TokenManager({
      tokenUrl: "https://x/token",
      requestToken: "req",
      fetchImpl: fetchImpl.impl,
      now: () => now,
    });

    expect(await tm.getToken()).toBe("tok-1");
    now = 60_000; // 1 min later, well inside the 15-min TTL
    expect(await tm.getToken()).toBe("tok-1");
    expect(fetchImpl.calls).toBe(1);
  });

  it("refreshes proactively before expiry (skew)", async () => {
    const fetchImpl = makeFetch(["tok-1", "tok-2"]);
    let now = 0;
    const tm = new TokenManager({
      tokenUrl: "https://x/token",
      requestToken: "req",
      fetchImpl: fetchImpl.impl,
      now: () => now,
      // 900s TTL, 120s skew → refresh due at t=780s.
    });

    expect(await tm.getToken()).toBe("tok-1");
    now = 780_000 + 1; // just past the refresh threshold
    expect(await tm.getToken()).toBe("tok-2");
    expect(fetchImpl.calls).toBe(2);
  });

  it("forces a refresh on demand (used for 401 handling)", async () => {
    const fetchImpl = makeFetch(["tok-1", "tok-2"]);
    const tm = new TokenManager({
      tokenUrl: "https://x/token",
      requestToken: "req",
      fetchImpl: fetchImpl.impl,
      now: () => 0,
    });
    expect(await tm.getToken()).toBe("tok-1");
    expect(await tm.getToken(true)).toBe("tok-2");
    expect(fetchImpl.calls).toBe(2);
  });

  it("coalesces concurrent refreshes into one request", async () => {
    const fetchImpl = makeFetch(["tok-1"]);
    const tm = new TokenManager({
      tokenUrl: "https://x/token",
      requestToken: "req",
      fetchImpl: fetchImpl.impl,
      now: () => 0,
    });
    const [a, b, c] = await Promise.all([tm.getToken(), tm.getToken(), tm.getToken()]);
    expect([a, b, c]).toEqual(["tok-1", "tok-1", "tok-1"]);
    expect(fetchImpl.calls).toBe(1);
  });

  it("throws on a non-OK token response", async () => {
    const impl = (async () => new Response("nope", { status: 401 })) as unknown as typeof fetch;
    const tm = new TokenManager({
      tokenUrl: "https://x/token",
      requestToken: "req",
      fetchImpl: impl,
    });
    await expect(tm.getToken()).rejects.toThrow(/token request failed/i);
  });

  it("throws when the response lacks an access_token", async () => {
    const impl = (async () =>
      new Response(JSON.stringify({ foo: "bar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const tm = new TokenManager({
      tokenUrl: "https://x/token",
      requestToken: "req",
      fetchImpl: impl,
    });
    await expect(tm.getToken()).rejects.toThrow(/missing access_token/i);
  });
});
