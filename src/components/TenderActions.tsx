"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * Follow / bid / dismiss actions. 🔔 follow persists to the DB for signed-in
 * users (PHASE-5 #4: FollowedTender, feeds the alert engine's "tender changed"
 * check) and falls back to localStorage for anonymous visitors (PHASE-3
 * behavior, unchanged). Bid/dismiss stay localStorage-only — no server model for
 * those outside the AI-matched feed. "Agendar" downloads an .ics.
 */
type Action = "NONE" | "BIDDING" | "DISMISSED";

export function TenderActions({ ocid, hasDeadline }: { ocid: string; hasDeadline: boolean }) {
  const t = dict().detail;
  const { status } = useSession();
  const [following, setFollowing] = useState(false);
  const [action, setAction] = useState<Action>("NONE");

  useEffect(() => {
    if (status === "authenticated") {
      void fetch(`/api/follow/${encodeURIComponent(ocid)}`)
        .then((r) => r.json())
        .then((r) => setFollowing(Boolean(r.data?.following)))
        .catch(() => {});
    } else if (status !== "loading") {
      try {
        setFollowing(localStorage.getItem(`paraou:follow:${ocid}`) === "1");
      } catch {
        /* ignore */
      }
    }
    try {
      setAction((localStorage.getItem(`paraou:action:${ocid}`) as Action) || "NONE");
    } catch {
      /* ignore */
    }
  }, [ocid, status]);

  async function toggleFollow() {
    if (status === "authenticated") {
      const res = await fetch(`/api/follow/${encodeURIComponent(ocid)}`, { method: "POST" });
      if (res.ok) setFollowing(Boolean((await res.json()).data?.following));
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
