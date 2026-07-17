"use client";

import { useEffect } from "react";

/**
 * One-time migration of Phase 3's localStorage follows into the DB (PHASE-5 step
 * 1). Renders nothing. Always attempts the POST on mount; the API 401s silently if
 * the visitor isn't signed in, which is the common case and expected — no session
 * check needed client-side for this.
 */
export function FollowMigrator() {
  useEffect(() => {
    let ocids: string[] = [];
    try {
      ocids = Object.keys(localStorage)
        .filter((k) => k.startsWith("paraou:follow:") && localStorage.getItem(k) === "1")
        .map((k) => k.slice("paraou:follow:".length));
    } catch {
      return;
    }
    if (ocids.length === 0) return;

    fetch("/api/follows/migrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ocids }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.ok) {
          for (const ocid of ocids) localStorage.removeItem(`paraou:follow:${ocid}`);
        }
      })
      .catch(() => {
        // Not signed in (401) or offline — try again next page load.
      });
  }, []);

  return null;
}
