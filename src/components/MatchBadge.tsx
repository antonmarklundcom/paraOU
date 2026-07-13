"use client";

import { useState } from "react";
import Link from "next/link";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * AI match badge + expandable reasoning (docs/05). Phase 4: renders REAL scores
 * from the Match table — the Phase 3 mock/feature-flag is gone. Renders nothing
 * when the row has no match for the visitor's profile.
 */

function scoreTone(score: number): string {
  if (score >= 75) return "text-status-open";
  if (score >= 50) return "text-status-closing";
  return "text-muted-foreground";
}

export interface MatchInfo {
  score: number;
  fitReasons: string[];
  cautions: string[];
}

export function MatchBadge({
  match,
  reasoningVisible = true,
}: {
  match?: MatchInfo | null;
  reasoningVisible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!match) return null;
  const t = dict().match;
  const expandable = reasoningVisible && (match.fitReasons.length > 0 || match.cautions.length > 0);

  if (!reasoningVisible) {
    return (
      <span className="inline-flex flex-col items-end">
        <span
          className={cn(
            "inline-flex items-center gap-1 text-xs font-semibold",
            scoreTone(match.score),
          )}
        >
          {match.score}% {t.badge}
        </span>
        <Link
          href="/precios"
          className="mt-0.5 text-[11px] text-primary underline decoration-dotted hover:no-underline"
        >
          🔒 {dict().upgrade.reasoningLocked}
        </Link>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={!expandable}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-semibold",
          scoreTone(match.score),
        )}
        aria-expanded={open}
      >
        {match.score}% {t.badge}
        {expandable && (
          <span className="font-normal text-muted-foreground underline decoration-dotted">
            · {t.why}
          </span>
        )}
      </button>
      {open && (
        <span className="mt-2 block w-64 max-w-full rounded-md border border-border bg-muted p-2 text-left text-xs">
          {match.fitReasons.length > 0 && (
            <>
              <span className="font-semibold">{t.reasons}:</span>
              <ul className="mb-1 list-disc pl-4">
                {match.fitReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </>
          )}
          {match.cautions.length > 0 && (
            <>
              <span className="font-semibold text-status-closing">⚠ {t.cautions}:</span>
              <ul className="list-disc pl-4">
                {match.cautions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </span>
      )}
    </span>
  );
}
