import { describe, it, expect } from "vitest";
import { z } from "zod";
import { DncpClient, DncpApiError } from "../client.js";
import { TokenManager } from "../auth.js";
import { RateLimiter } from "../rateLimit.js";

const schema = z.object({ ok: z.boolean() });

function tokenManager() {
  let n = 0;
  const impl = (async () => {
    n++;
    return new Response(JSON.stringify({ access_token: `tok-${n}`, expires_in: 900 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return new TokenManager({ tokenUrl: "https://x/token", requestToken: "req", fetchImpl: impl });
}

function instantLimiter() {
  return new RateLimiter({
    requestsPerSecond: 1000,
    burst: 1000,
    maxRequestsPerWindow: 1_000_000,
    sleep: async () => {},
  });
}

function client(fetchImpl: typeof fetch) {
  return new DncpClient({
    apiBase: "https://api.example/v3",
    tokenManager: tokenManager(),
    rateLimiter: instantLimiter(),
    fetchImpl,
    maxRetries: 4,
    sleep: async () => {}, // no real backoff delay in tests
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("DncpClient", () => {
  it("refreshes the token once and retries on 401", async () => {
    const responses = [jsonResponse({}, 401), jsonResponse({ ok: true })];
    let i = 0;
    const fetchImpl = (async () => responses[i++]!) as unknown as typeof fetch;
    const result = await client(fetchImpl).get("ping", schema);
    expect(result).toEqual({ ok: true });
    expect(i).toBe(2);
  });

  it("backs off and retries on 429, then succeeds", async () => {
    const responses = [jsonResponse({}, 429), jsonResponse({ ok: true })];
    let i = 0;
    const fetchImpl = (async () => responses[i++]!) as unknown as typeof fetch;
    const result = await client(fetchImpl).get("ping", schema);
    expect(result).toEqual({ ok: true });
    expect(i).toBe(2);
  });

  it("retries on 5xx up to the limit then throws", async () => {
    let i = 0;
    const fetchImpl = (async () => {
      i++;
      return jsonResponse({ err: true }, 503);
    }) as unknown as typeof fetch;
    await expect(client(fetchImpl).get("ping", schema)).rejects.toBeInstanceOf(DncpApiError);
    expect(i).toBe(5); // initial + 4 retries
  });

  it("throws a validation error when the body does not match the schema", async () => {
    const fetchImpl = (async () =>
      jsonResponse({ ok: "not-a-boolean" })) as unknown as typeof fetch;
    await expect(client(fetchImpl).get("ping", schema)).rejects.toThrow(/validation/i);
  });
});
