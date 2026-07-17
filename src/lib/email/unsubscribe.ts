import { createHmac, timingSafeEqual } from "node:crypto";
import { authSecret } from "../env.js";

/** One-click unsubscribe token (docs/05: deliverability matters). HMAC-signed
 * userId, no DB lookup needed to verify — Node's built-in crypto, no new
 * dependency to bring in and verify. */
export function unsubscribeToken(userId: string): string {
  const sig = createHmac("sha256", authSecret()).update(userId).digest("hex").slice(0, 32);
  return `${userId}.${sig}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
  const [userId, sig] = token.split(".");
  if (!userId || !sig) return null;
  const expected = createHmac("sha256", authSecret()).update(userId).digest("hex").slice(0, 32);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return userId;
}
