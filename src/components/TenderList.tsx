"use client";

import { useState, useCallback } from "react";
import type { TenderListItem } from "@/lib/api/tenders";
import { TenderCard } from "@/components/TenderCard";
import { dict } from "@/lib/i18n";

/**
 * Result list: SSR renders the first page (passed as `initialItems`); "Ver más"
 * fetches subsequent pages from /api/tenders with the keyset cursor and appends
 * them client-side (docs/05 / PHASE-3: SSR first page + client-side updates).
 */
export function TenderList({
  initialItems,
  initialCursor,
  queryString,
  usdRate,
}: {
  initialItems: TenderListItem[];
  initialCursor: string | null;
  queryString: string; // serialized filters, e.g. "?status=OPEN" or ""
  usdRate: number;
}) {
  const t = dict().overview;
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const usp = new URLSearchParams(queryString.replace(/^\?/, ""));
      usp.set("cursor", cursor);
      const res = await fetch(`/api/tenders?${usp.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setItems((prev) => [...prev, ...json.data.items]);
        setCursor(json.data.nextCursor);
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
        <TenderCard key={item.ocid} tender={item} usdRate={usdRate} />
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
