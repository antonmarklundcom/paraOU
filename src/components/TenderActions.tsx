"use client";

import { useEffect, useState } from "react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

/**
 * Follow / bid / dismiss actions. Real persistence lands with accounts (Phase 5);
 * for now anonymous state lives in localStorage so the UX is fully testable
 * (PHASE-3). "Agendar" downloads an .ics from the calendar route.
 */
type Action = "NONE" | "BIDDING" | "DISMISSED";

export function TenderActions({ ocid, hasDeadline }: { ocid: string; hasDeadline: boolean }) {
  const t = dict().detail;
  const [following, setFollowing] = useState(false);
  const [action, setAction] = useState<Action>("NONE");

  useEffect(() => {
    try {
      setFollowing(localStorage.getItem(`paraou:follow:${ocid}`) === "1");
      setAction((localStorage.getItem(`paraou:action:${ocid}`) as Action) || "NONE");
    } catch {
      /* ignore */
    }
  }, [ocid]);

  function toggleFollow() {
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
        onClick={toggleFollow}
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
