"use client";

import { dict } from "@/lib/i18n";

/**
 * AI match badge (docs/05). Phase 3 non-goal: real matching is Phase 4, so this
 * renders behind a feature flag with MOCK data purely to prove the layout. Enable
 * with NEXT_PUBLIC_SHOW_MATCH_BADGE=1.
 */
export function matchFeatureEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_MATCH_BADGE === "1";
}

/** Deterministic mock score from the ocid so the layout looks real in demos. */
function mockScore(ocid: string): number {
  let h = 0;
  for (const ch of ocid) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return 60 + (h % 40); // 60–99
}

export function MatchBadge({ ocid }: { ocid: string }) {
  if (!matchFeatureEnabled()) return null;
  const score = mockScore(ocid);
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
      {score}% {dict().match.badge}
      <span className="font-normal text-muted-foreground">· {dict().match.why}</span>
    </span>
  );
}
