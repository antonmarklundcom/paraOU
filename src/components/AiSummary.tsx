"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { dict } from "@/lib/i18n";

/**
 * "Resumen en simple" block (PHASE-4 deliverable 4): the cached AI summary with the
 * mandatory verify-in-the-official-pliego disclaimer and a feedback button
 * (docs/04 feedback loop → AiFeedback table, reviewed on /admin/ai).
 */
export function AiSummary({ tenderId, summary }: { tenderId: string; summary: string }) {
  const t = dict();
  const [voted, setVoted] = useState(false);

  async function vote(helpful: boolean) {
    setVoted(true); // optimistic — feedback is best-effort
    try {
      await fetch("/api/ai/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: "summary", tenderId, helpful }),
      });
    } catch {
      /* best-effort */
    }
  }

  const btn = "rounded-md border border-border px-2 py-1 text-xs hover:bg-accent";
  return (
    <Card className="mt-5 p-4">
      <h2 className="text-sm font-semibold">✨ {t.detail.summary}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{t.aiSummary.disclaimer}</span>
        {voted ? (
          <span>{t.aiSummary.thanks}</span>
        ) : (
          <span className="flex items-center gap-2">
            {t.aiSummary.helpful}
            <button type="button" className={btn} onClick={() => void vote(true)}>
              👍 {t.aiSummary.yes}
            </button>
            <button type="button" className={btn} onClick={() => void vote(false)}>
              👎 {t.aiSummary.no}
            </button>
          </span>
        )}
      </div>
    </Card>
  );
}
