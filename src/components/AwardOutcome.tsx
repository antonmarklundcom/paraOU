"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { profileFetch } from "@/lib/profileStore";

/**
 * "¿Por qué perdí?" callout (PHASE-F4): only rendered for a viewer who marked this
 * tender "Voy a ofertar" (Match.userAction = BIDDING) and whose match is server-
 * persisted. The award info itself (winner/price/%) is precomputed server-side and
 * passed in as props — this component's only job is to check whether *this*
 * viewer is the bidder before showing it, mirroring the same alert already emailed
 * by the alert engine (src/lib/alerts/collect.ts `fromAwards`).
 */
export function AwardOutcome({
  tenderId,
  winnerName,
  priceLabel,
  percentLabel,
}: {
  tenderId: string;
  winnerName: string;
  priceLabel: string;
  percentLabel: string | null;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void profileFetch(`/api/profile/matches/${tenderId}/action`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r) => {
        if (!cancelled) setVisible(r?.data?.action === "BIDDING");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenderId]);

  if (!visible) return null;

  return (
    <Card className="mt-5 border-status-open/40 bg-status-open/5 p-4">
      <h2 className="mb-1 text-sm font-semibold">¿Por qué perdí?</h2>
      <p className="text-sm">
        Marcaste esta licitación como <strong>&quot;Voy a ofertar&quot;</strong>. Se adjudicó a{" "}
        <strong>{winnerName}</strong> por <strong>{priceLabel}</strong>
        {percentLabel ? ` (${percentLabel})` : ""}.
      </p>
    </Card>
  );
}
