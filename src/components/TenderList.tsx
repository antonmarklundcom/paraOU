"use client";

import { useState, useCallback, useEffect } from "react";
import type { TenderListItem } from "@/lib/api/tenders";
import { TenderCard } from "@/components/TenderCard";
import type { MatchSummary } from "@/components/MatchBadge";
import { dict } from "@/lib/i18n";

type MatchMap = Record<string, MatchSummary>;

async function fetchMatches(ocids: string[]): Promise<MatchMap> {
  if (ocids.length === 0) return {};
  const usp = new URLSearchParams();
  for (const o of ocids) usp.append("ocid", o);
  const res = await fetch(`/api/matches/for-ocids?${usp.toString()}`);
  const json = await res.json();
  return json.ok ? json.data : {};
}

/**
 * Result list: SSR renders the first page (passed as `initialItems`); "Ver más"
 * fetches subsequent pages from /api/tenders with the keyset cursor and appends
 * them client-side (docs/05 / PHASE-3: SSR first page + client-side updates).
 * `initialMatches` seeds Phase 4 match badges for the SSR page; badges for
 * "load more" pages are fetched client-side once a profile exists.
 */
export function TenderList({
  initialItems,
  initialCursor,
  initialMatches,
  queryString,
  usdRate,
}: {
  initialItems: TenderListItem[];
  initialCursor: string | null;
  initialMatches?: MatchMap;
  queryString: string; // serialized filters, e.g. "?status=OPEN" or ""
  usdRate: number;
}) {
  const t = dict().overview;
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [matches, setMatches] = useState<MatchMap>(initialMatches ?? {});
  const [loading, setLoading] = useState(false);

  // Keep in sync if the parent SSR-navigates to a new filter/sort (new initialItems).
  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
    setMatches(initialMatches ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems, initialCursor]);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const usp = new URLSearchParams(queryString.replace(/^\?/, ""));
      usp.set("cursor", cursor);
      const res = await fetch(`/api/tenders?${usp.toString()}`);
      const json = await res.json();
      if (json.ok) {
        const newItems: TenderListItem[] = json.data.items;
        setItems((prev) => [...prev, ...newItems]);
        setCursor(json.data.nextCursor);
        const more = await fetchMatches(newItems.map((i) => i.ocid));
        if (Object.keys(more).length > 0) setMatches((prev) => ({ ...prev, ...more }));
      }
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, queryString]);

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground">
        {t.empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <TenderCard key={item.ocid} tender={item} usdRate={usdRate} match={matches[item.ocid]} />
      ))}
      {cursor && (
        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent disabled:opacity-60"
          >
            {loading ? "…" : t.more}
          </button>
        </div>
      )}
    </div>
  );
}
