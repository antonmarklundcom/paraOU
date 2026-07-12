"use client";

import Link from "next/link";
import type { TenderListItem } from "@/lib/api/tenders";
import { Card, StatusBadge, Tag } from "@/components/ui";
import { MatchBadge, type MatchInfo } from "@/components/MatchBadge";
import { formatGs, formatUsdApprox, formatDateShort, deadlinePhrase } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Tender row card (docs/05 anatomy). Real link (SSR, middle-click friendly). The
 * deadline countdown is the most prominent secondary element.
 */
export function TenderCard({
  tender,
  usdRate,
  match,
}: {
  tender: TenderListItem;
  usdRate: number;
  match?: MatchInfo | null;
}) {
  const usd = formatUsdApprox(tender.amountMax, usdRate);
  const closingSoon =
    tender.daysUntilDeadline !== null &&
    tender.daysUntilDeadline >= 0 &&
    tender.daysUntilDeadline <= 7;

  return (
    <Card className="p-4 transition-colors hover:border-primary/50">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={tender.status} daysUntilDeadline={tender.daysUntilDeadline} />
        <MatchBadge match={match} />
      </div>

      <h3 className="mt-1.5 text-base font-semibold leading-snug">
        <Link href={`/licitaciones/${encodeURIComponent(tender.ocid)}`} className="hover:underline">
          {tender.title}
        </Link>
      </h3>

      <p className="mt-1 text-sm text-muted-foreground">
        {[tender.buyerName, tender.department, tender.procurementMethod]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm font-medium">
          {formatGs(tender.amountMax)}
          {usd && <span className="ml-1 font-normal text-muted-foreground">({usd})</span>}
        </span>
        <span
          className={cn(
            "text-sm font-semibold",
            closingSoon ? "text-status-closing" : "text-muted-foreground",
          )}
        >
          ⏰ {deadlinePhrase(tender.daysUntilDeadline)}
          {tender.deadlineAt && (
            <span className="ml-1 font-normal">({formatDateShort(tender.deadlineAt)})</span>
          )}
        </span>
      </div>

      {tender.categoryName && (
        <div className="mt-3">
          <Tag>{tender.categoryName}</Tag>
        </div>
      )}
    </Card>
  );
}
