import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../pagination.js";
import { ApiError } from "../http.js";

describe("cursor encoding", () => {
  it("round-trips a cursor", () => {
    const c = { v: "2024-03-10 12:00:00", id: "ocds-03ad3f-1" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("is URL-safe (base64url, no +/=)", () => {
    const encoded = encodeCursor({ v: "a?b&c/d+e", id: "x/y+z" });
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it("rejects malformed cursors with a 400 ApiError", () => {
    expect(() => decodeCursor("not-base64-$$$")).toThrow(ApiError);
    try {
      decodeCursor("bm90LWpzb24");
    } catch (err) {
      expect((err as ApiError).status).toBe(400);
    }
  });
});
