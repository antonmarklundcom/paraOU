"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, StatusBadge, Tag } from "@/components/ui";
import { MatchBadge } from "@/components/MatchBadge";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { formatGs, formatDateShort, deadlinePhrase } from "@/lib/format";
import { profileFetch } from "@/lib/profileStore";

/**
 * Match feed row (docs/05 card anatomy + match badge with expandable reasoning).
 * Actions persist to Match.userAction via the profile API — the north-star metric
 * that later tunes thresholds (docs/04 feedback loop).
 */

export interface MatchItem {
  tenderId: string;
  ocid: string;
  title: string;
  buyerName: string | null;
  department: string | null;
  procurementMethod: string | null;
  categoryName: string | null;
  status: string;
  amountMax: string | null;
  currency: string;
  deadlineAt: string | null;
  daysUntilDeadline: number | null;
  score: number;
  verdict: string;
  fitReasons: string[];
  cautions: string[];
  /** False when the plan's daily full-reasoning cap hides fitReasons/cautions
   * (PHASE-6 #1) — score/verdict still show. */
  reasoningVisible?: boolean;
  userAction: "NONE" | "SAVED" | "BIDDING" | "DISMISSED";
}

export function MatchCard({
  item,
  readOnly = false,
  onAction,
}: {
  item: MatchItem;
  readOnly?: boolean;
  onAction?: (tenderId: string, action: MatchItem["userAction"]) => void;
}) {
  const t = dict().match;
  const [action, setAction] = useState(item.userAction);
  const [busy, setBusy] = useState(false);

  async function act(next: MatchItem["userAction"]) {
    const value = action === next ? "NONE" : next;
    setBusy(true);
    try {
      const res = await profileFetch(`/api/profile/matches/${item.tenderId}/action`, {
        method: "POST",
        body: JSON.stringify({ action: value }),
      });
      if (res.ok) {
        setAction(value);
        onAction?.(item.tenderId, value);
      }
    } finally {
      setBusy(false);
    }
  }

  const closingSoon =
    item.daysUntilDeadline !== null && item.daysUntilDeadline >= 0 && item.daysUntilDeadline <= 7;
  const actionBtn = "rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent";

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={item.status} daysUntilDeadline={item.daysUntilDeadline} />
        <MatchBadge
          match={{ score: item.score, fitReasons: item.fitReasons, cautions: item.cautions }}
          reasoningVisible={item.reasoningVisible ?? true}
        />
      </div>
      <h3 className="mt-1.5 text-base font-semibold leading-snug">
        <Link href={`/licitaciones/${encodeURIComponent(item.ocid)}`} className="hover:underline">
          {item.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {[item.buyerName, item.department, item.procurementMethod].filter(Boolean).join(" · ")}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm font-medium">{formatGs(item.amountMax)}</span>
        <span
          className={cn(
            "text-sm font-semibold",
            closingSoon ? "text-status-closing" : "text-muted-foreground",
          )}
        >
          ⏰ {deadlinePhrase(item.daysUntilDeadline)}
          {item.deadlineAt && (
            <span className="ml-1 font-normal">({formatDateShort(item.deadlineAt)})</span>
          )}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {item.categoryName ? <Tag>{item.categoryName}</Tag> : <span />}
        {!readOnly && (
          <span className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("SAVED")}
              className={cn(actionBtn, action === "SAVED" && "border-primary text-primary")}
            >
              ⭐ {action === "SAVED" ? t.saved : t.save}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("BIDDING")}
              className={cn(
                actionBtn,
                action === "BIDDING" && "border-status-open text-status-open",
              )}
            >
              ✅ {action === "BIDDING" ? t.bidding : t.bid}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act("DISMISSED")}
              className={cn(
                actionBtn,
                action === "DISMISSED" && "border-status-closed text-status-closed",
              )}
            >
              ✖️ {t.dismiss}
            </button>
          </span>
        )}
      </div>
    </Card>
  );
}
