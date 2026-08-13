/**
 * Shared "which award decided this tender" logic (PHASE-F4 award notifications).
 * Used by the alert engine (src/lib/alerts/collect.ts) and the tender detail page
 * so both agree on the same winning award when a tender has more than one line.
 */

/** The OCDS-active award wins; falls back to the first award carrying an amount. */
export function pickDecidingAward<T extends { status: string | null; amount: unknown }>(
  awards: T[],
): T | null {
  const active = awards.find((a) => (a.status ?? "active").toLowerCase() === "active");
  if (active && active.amount !== null) return active;
  return awards.find((a) => a.amount !== null) ?? null;
}
