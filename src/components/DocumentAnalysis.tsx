"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card } from "@/components/ui";
import { dict } from "@/lib/i18n";

interface Requirement {
  item: string;
  note?: string;
}
interface Result {
  summary: string;
  requirements: Requirement[];
  warnings: string[];
  cached: boolean;
}

/**
 * "Analizar pliego" — Business tier (PHASE-6 #4). Signed-out/non-Business users
 * see an upgrade prompt instead of a dead 403; the button only fires the (heavy,
 * quota'd) request for entitled users.
 */
export function DocumentAnalysis({ ocid, hasDocuments }: { ocid: string; hasDocuments: boolean }) {
  const t = dict().docAnalysis;
  const { status, data: session } = useSession();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!hasDocuments) return null;

  async function analyze() {
    setState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tenders/${encodeURIComponent(ocid)}/analyze`, {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) {
        setErrorMsg(body.error?.message ?? t.genericError);
        setState("error");
        return;
      }
      setResult(body.data);
      setState("idle");
    } catch {
      setErrorMsg(t.genericError);
      setState("error");
    }
  }

  const isBusiness = session?.user?.plan === "BUSINESS" || session?.user?.plan === "AGENCY";

  return (
    <Card className="mt-5 p-4">
      <h2 className="text-sm font-semibold">📑 {t.title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t.hint}</p>

      {status !== "authenticated" ? (
        <Link href="/login" className="mt-3 inline-block text-sm text-primary hover:underline">
          {t.signInFirst}
        </Link>
      ) : !isBusiness ? (
        <Link href="/precios" className="mt-3 inline-block text-sm text-primary hover:underline">
          🔒 {t.businessOnly}
        </Link>
      ) : (
        !result && (
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={state === "loading"}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {state === "loading" ? t.analyzing : t.button}
          </button>
        )
      )}

      {state === "error" && errorMsg && (
        <p className="mt-2 text-sm text-status-closed">{errorMsg}</p>
      )}

      {result && (
        <div className="mt-4 text-sm">
          <p className="text-muted-foreground">{result.summary}</p>
          {result.warnings.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-status-closing">
              {result.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          {result.requirements.length > 0 && (
            <ul className="mt-3 space-y-2">
              {result.requirements.map((r) => (
                <li key={r.item} className="flex gap-2">
                  <span aria-hidden>☐</span>
                  <span>
                    <span className="font-medium">{r.item}</span>
                    {r.note && <span className="text-muted-foreground"> — {r.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {t.disclaimer} {result.cached && t.cachedNote}
          </p>
        </div>
      )}
    </Card>
  );
}
