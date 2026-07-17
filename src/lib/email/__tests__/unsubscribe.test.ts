import { describe, it, expect } from "vitest";
import { unsubscribeToken, verifyUnsubscribeToken } from "../unsubscribe.js";

describe("unsubscribe token", () => {
  it("round-trips a valid token", () => {
    const token = unsubscribeToken("user-123");
    expect(verifyUnsubscribeToken(token)).toBe("user-123");
  });

  it("rejects a tampered signature", () => {
    const token = unsubscribeToken("user-123");
    const [userId] = token.split(".");
    const tampered = `${userId}.${"0".repeat(32)}`;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it("rejects a token for a different user (signature won't match)", () => {
    const token = unsubscribeToken("user-123");
    const [, sig] = token.split(".");
    const forged = `user-456.${sig}`;
    expect(verifyUnsubscribeToken(forged)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });
});
