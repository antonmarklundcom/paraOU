import { describe, expect, it } from "vitest";
import type { WhatsappDeliveryStatus } from "@prisma/client";
import {
  classifyFailure,
  countsAsFailure,
  countsAsSuccess,
  isDelivered,
  isTerminalFailure,
  nextDeliveryStatus,
  nextFailureCount,
} from "../deliveryState.js";

/**
 * PHASE-F1 acceptance: the delivery state machine must survive out-of-order and
 * duplicated provider webhooks without regressing state or double-counting a
 * failure. These are the rules the whole opt-out safety valve rests on.
 */

describe("nextDeliveryStatus", () => {
  it("advances along the happy path", () => {
    expect(nextDeliveryStatus("QUEUED", "SENT")).toBe("SENT");
    expect(nextDeliveryStatus("SENT", "DELIVERED")).toBe("DELIVERED");
    expect(nextDeliveryStatus("DELIVERED", "READ")).toBe("READ");
  });

  it("never regresses when events arrive out of order", () => {
    // `read` before `delivered`, then the late `delivered` and `sent` callbacks.
    expect(nextDeliveryStatus("READ", "DELIVERED")).toBe("READ");
    expect(nextDeliveryStatus("READ", "SENT")).toBe("READ");
    expect(nextDeliveryStatus("DELIVERED", "QUEUED")).toBe("DELIVERED");
  });

  it("is idempotent for replayed events", () => {
    const statuses: WhatsappDeliveryStatus[] = [
      "QUEUED",
      "SENT",
      "DELIVERED",
      "READ",
      "FAILED",
      "UNDELIVERED",
    ];
    for (const s of statuses) expect(nextDeliveryStatus(s, s)).toBe(s);
  });

  it("takes a terminal failure from any non-delivered state", () => {
    expect(nextDeliveryStatus("QUEUED", "FAILED")).toBe("FAILED");
    expect(nextDeliveryStatus("SENT", "UNDELIVERED")).toBe("UNDELIVERED");
  });

  it("keeps proof of delivery over a late failure callback", () => {
    expect(nextDeliveryStatus("DELIVERED", "FAILED")).toBe("DELIVERED");
    expect(nextDeliveryStatus("READ", "UNDELIVERED")).toBe("READ");
  });

  it("treats a terminal failure as final", () => {
    expect(nextDeliveryStatus("FAILED", "DELIVERED")).toBe("FAILED");
    expect(nextDeliveryStatus("UNDELIVERED", "SENT")).toBe("UNDELIVERED");
  });
});

describe("failure/success accounting", () => {
  it("counts only the entry into a failure state", () => {
    expect(countsAsFailure("SENT", "FAILED")).toBe(true);
    expect(countsAsFailure("FAILED", "FAILED")).toBe(false);
    expect(countsAsFailure("UNDELIVERED", "FAILED")).toBe(false);
  });

  it("counts only the entry into a delivered state", () => {
    expect(countsAsSuccess("SENT", "DELIVERED")).toBe(true);
    expect(countsAsSuccess("DELIVERED", "READ")).toBe(false);
  });

  it("classifies predicates", () => {
    expect(isTerminalFailure("FAILED")).toBe(true);
    expect(isTerminalFailure("UNDELIVERED")).toBe(true);
    expect(isTerminalFailure("SENT")).toBe(false);
    expect(isDelivered("READ")).toBe(true);
    expect(isDelivered("SENT")).toBe(false);
  });
});

describe("classifyFailure / nextFailureCount", () => {
  it("burns the whole budget on a permanently bad number", () => {
    expect(classifyFailure("63003")).toBe("permanent_recipient");
    expect(nextFailureCount(0, "permanent_recipient", 3)).toBe(3);
  });

  it("never penalizes the recipient for our own template/config errors", () => {
    expect(classifyFailure("63016")).toBe("sender_side");
    expect(nextFailureCount(2, "sender_side", 3)).toBe(2);
  });

  it("increments one at a time for transient/unknown errors", () => {
    expect(classifyFailure("30008")).toBe("transient");
    expect(classifyFailure(null)).toBe("transient");
    expect(nextFailureCount(1, "transient", 3)).toBe(2);
  });
});
