"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { dict } from "@/lib/i18n";
import { profileFetch } from "@/lib/profileStore";

interface SavedSearch {
  id: string;
  name: string;
  params: Record<string, string | string[]>;
  alerting: boolean;
}

function toQueryString(params: SavedSearch["params"]): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
    else usp.append(k, v);
  }
  return usp.toString();
}

/** Manage saved searches from /panel: rename, toggle alert, delete (PHASE-5 #2). */
export function SavedSearchesPanel() {
  const { status } = useSession();
  const t = dict().cuenta;
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);

  async function load() {
    const res = await profileFetch("/api/saved-searches");
    if (res.ok) setSearches((await res.json()).data);
  }

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [status]);

  if (status !== "authenticated" || !searches || searches.length === 0) return null;

  async function toggleAlert(s: SavedSearch) {
    await fetch(`/api/saved-searches/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alerting: !s.alerting }),
    });
    void load();
  }

  async function rename(s: SavedSearch) {
    const name = window.prompt(t.rename, s.name);
    if (!name) return;
    await fetch(`/api/saved-searches/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    void load();
  }

  async function remove(s: SavedSearch) {
    await fetch(`/api/saved-searches/${s.id}`, { method: "DELETE" });
    void load();
  }

  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{t.savedSearches}</h2>
      <div className="space-y-2">
        {searches.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <Link
              href={`/licitaciones?${toQueryString(s.params)}`}
              className="font-medium hover:underline"
            >
              {s.name}
            </Link>
            <span className="flex items-center gap-3 text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={s.alerting} onChange={() => void toggleAlert(s)} />
                {t.toggleAlert}
              </label>
              <button type="button" onClick={() => void rename(s)} className="hover:text-primary">
                {t.rename}
              </button>
              <button
                type="button"
                onClick={() => void remove(s)}
                className="hover:text-status-closed"
              >
                {t.delete}
              </button>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
