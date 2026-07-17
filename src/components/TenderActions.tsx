"use client";

import { useEffect, useState } from "react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * Follow / bid / dismiss actions. Follow persists to the DB when signed in
 * (PHASE-5), or to localStorage for anonymous visitors (PHASE-3 behavior,
 * migrated on first sign-in by FollowMigrator). Bid/dismiss remain
 * localStorage-only — they're not part of the Phase 5 deliverables (Match.userAction
 * on the /panel feed is the tracked equivalent for matched tenders).
 */
type Action = "NONE" | "BIDDING" | "DISMISSED";

export function TenderActions({ ocid, hasDeadline }: { ocid: string; hasDeadline: boolean }) {
  const t = dict().detail;
  const [following, setFollowing] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [action, setAction] = useState<Action>("NONE");

  useEffect(() => {
    fetch(`/api/follows/${encodeURIComponent(ocid)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) return;
        setAuthenticated(json.data.authenticated);
        if (json.data.authenticated) {
          setFollowing(json.data.following);
        } else {
          try {
            setFollowing(localStorage.getItem(`paraou:follow:${ocid}`) === "1");
          } catch {
            /* ignore */
          }
        }
      })
      .catch(() => {
        try {
          setFollowing(localStorage.getItem(`paraou:follow:${ocid}`) === "1");
        } catch {
          /* ignore */
        }
      });

    try {
      setAction((localStorage.getItem(`paraou:action:${ocid}`) as Action) || "NONE");
    } catch {
      /* ignore */
    }
  }, [ocid]);

  async function toggleFollow() {
    if (authenticated) {
      const res = await fetch(`/api/follows/${encodeURIComponent(ocid)}`, { method: "POST" });
      const json = await res.json();
      if (json.ok) setFollowing(json.data.following);
      return;
    }
    const next = !following;
    setFollowing(next);
    try {
      localStorage.setItem(`paraou:follow:${ocid}`, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function setActionPersisted(a: Action) {
    const next = action === a ? "NONE" : a;
    setAction(next);
    try {
      localStorage.setItem(`paraou:action:${ocid}`, next);
    } catch {
      /* ignore */
    }
  }

  const btn = "rounded-md border border-border px-3 py-2 text-sm hover:bg-accent";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void toggleFollow()}
        className={cn(btn, following && "border-primary text-primary")}
      >
        {following ? `🔔 ${t.following}` : `🔔 ${t.follow}`}
      </button>
      <button
        type="button"
        onClick={() => setActionPersisted("BIDDING")}
        className={cn(btn, action === "BIDDING" && "border-status-open text-status-open")}
      >
        ✅ {t.bid}
      </button>
      <button
        type="button"
        onClick={() => setActionPersisted("DISMISSED")}
        className={cn(btn, action === "DISMISSED" && "border-status-closed text-status-closed")}
      >
        ✖️ {t.dismiss}
      </button>
      {hasDeadline && (
        <a href={`/licitaciones/${encodeURIComponent(ocid)}/calendar`} className={btn}>
          📅 {t.addCalendar}
        </a>
      )}
    </div>
  );
}
