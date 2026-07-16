"use client";

import { useState } from "react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export interface MatchSummary {
  score: number;
  verdict: string;
  reasoning: string;
  cautions: string[];
}

/**
 * Real AI match badge (docs/04/05, Phase 4 — unflags the Phase 3 mock). Only
 * renders when a `match` is passed (i.e. the visitor has a profile and this tender
 * scored ≥ SHOW_THRESHOLD). Clicking expands the reasoning inline, no page jump.
 */
export function MatchBadge({ match }: { match: MatchSummary | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!match) return null;
  const t = dict().match;

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
      >
        {match.score}% {t.badge}
        <span className="font-normal text-muted-foreground">· {t.why}</span>
      </button>
      {open && (
        <div className="mt-2 max-w-xs rounded-md border border-border bg-muted p-2 text-left text-xs text-muted-foreground">
          <p>{match.reasoning}</p>
          {match.cautions.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc space-y-0.5">
              {match.cautions.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function MatchScorePill({ score }: { score: number }) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", "bg-primary/10 text-primary")}
    >
      {score}%
    </span>
  );
}
