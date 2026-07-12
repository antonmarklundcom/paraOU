"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { getProfileToken } from "@/lib/profileStore";

/**
 * Fires once per session, right after Auth.js reports an authenticated session:
 * claims the browser's anonymous profile (if any) into the account (PHASE-5 #1,
 * "on first login, migrate the anonymous localStorage profile/actions into the
 * DB"). Renders nothing — mount once near the root.
 */
export function ClaimProfileOnLogin() {
  const { status } = useSession();
  const claimed = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || claimed.current) return;
    const anonToken = getProfileToken();
    if (!anonToken) {
      claimed.current = true;
      return;
    }
    claimed.current = true;
    void fetch("/api/profile/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ anonToken }),
    });
  }, [status]);

  return null;
}
