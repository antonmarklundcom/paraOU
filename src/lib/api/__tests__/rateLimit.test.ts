import { describe, it, expect } from "vitest";
import { FixedWindowRateLimiter, clientIp } from "../rateLimit.js";
import { ApiError } from "../http.js";

describe("FixedWindowRateLimiter", () => {
  it("allows up to the limit then throws 429", () => {
    const now = 0;
    const rl = new FixedWindowRateLimiter(3, 60_000, () => now);
    rl.check("ip1");
    rl.check("ip1");
    rl.check("ip1");
    expect(() => rl.check("ip1")).toThrow(ApiError);
    try {
      rl.check("ip1");
    } catch (err) {
      expect((err as ApiError).status).toBe(429);
      expect((err as ApiError).details).toMatchObject({ retryAfter: expect.any(Number) });
    }
  });

  it("resets after the window elapses", () => {
    let now = 0;
    const rl = new FixedWindowRateLimiter(2, 60_000, () => now);
    rl.check("ip1");
    rl.check("ip1");
    expect(() => rl.check("ip1")).toThrow();
    now = 60_001;
    expect(() => rl.check("ip1")).not.toThrow();
  });

  it("tracks each IP independently", () => {
    const now = 0;
    const rl = new FixedWindowRateLimiter(1, 60_000, () => now);
    rl.check("a");
    rl.check("b");
    expect(() => rl.check("a")).toThrow();
  });
});

describe("clientIp", () => {
  it("prefers the first X-Forwarded-For hop", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(req)).toBe("1.2.3.4");
  });

  it("falls back to unknown when no headers present", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
