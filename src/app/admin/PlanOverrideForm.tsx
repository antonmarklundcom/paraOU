"use client";

import { useState } from "react";

/** Admin-only manual plan override (PHASE-6 #2/#5). */
export function PlanOverrideForm({ userId, currentPlan }: { userId: string; currentPlan: string }) {
  const [plan, setPlan] = useState(currentPlan);
  const [manualBilling, setManualBilling] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const res = await fetch("/api/admin/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, plan, manualBilling }),
    });
    if (res.ok) setSaved(true);
  }

  return (
    <span className="flex items-center gap-1.5">
      <select
        className="rounded border border-border bg-background px-1 py-0.5 text-xs"
        value={plan}
        onChange={(e) => setPlan(e.target.value)}
      >
        {["FREE", "PRO", "BUSINESS", "AGENCY"].map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={manualBilling}
          onChange={(e) => setManualBilling(e.target.checked)}
        />
        manual
      </label>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
      >
        {saved ? "✓" : "Set"}
      </button>
    </span>
  );
}
