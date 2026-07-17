"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";

interface SavedSearchRow {
  id: string;
  name: string;
  alerting: boolean;
  params: Record<string, string>;
}

/** Manage saved searches from /panel: rename toggle alerting, delete, or open
 * (docs/05 §3). */
export function SavedSearchList({ initial }: { initial: SavedSearchRow[] }) {
  const [items, setItems] = useState(initial);

  async function toggleAlerting(id: string, alerting: boolean) {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, alerting } : s)));
    await fetch(`/api/saved-searches/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alerting }),
    });
  }

  async function remove(id: string) {
    setItems((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/saved-searches/${id}`, { method: "DELETE" });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no guardaste ninguna búsqueda.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((s) => (
        <Card key={s.id} className="flex items-center justify-between gap-3 p-3">
          <Link
            href={`/licitaciones?${new URLSearchParams(s.params).toString()}`}
            className="text-sm font-medium hover:underline"
          >
            {s.name}
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={s.alerting}
                onChange={(e) => void toggleAlerting(s.id, e.target.checked)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Alertas
            </label>
            <button
              type="button"
              onClick={() => void remove(s.id)}
              className="text-status-closing hover:underline"
            >
              Eliminar
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
