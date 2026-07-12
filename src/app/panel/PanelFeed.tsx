"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MatchCard, type MatchItem } from "@/components/MatchCard";
import { dict } from "@/lib/i18n";
import { getProfileToken, profileFetch } from "@/lib/profileStore";

/** Grouped feed: Nuevos / Cierran pronto / Guardados (docs/05 §3). */

interface Feed {
  nuevos: MatchItem[];
  cierranPronto: MatchItem[];
  guardados: MatchItem[];
}

export function PanelFeed() {
  const t = dict().panel;
  const [feed, setFeed] = useState<Feed | null>(null);
  const [state, setState] = useState<"loading" | "noProfile" | "ready">("loading");

  const load = useCallback(async () => {
    if (!getProfileToken()) {
      setState("noProfile");
      return;
    }
    const res = await profileFetch("/api/profile/matches");
    if (!res.ok) {
      setState("noProfile");
      return;
    }
    const { data } = await res.json();
    setFeed(data);
    setState("ready");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return <p className="mt-6 text-sm text-muted-foreground">…</p>;
  }
  if (state === "noProfile") {
    return (
      <div className="mt-6 rounded-lg border border-border p-6 text-center">
        <p className="text-muted-foreground">{t.noProfile}</p>
        <Link
          href="/perfil"
          className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {t.createProfile}
        </Link>
      </div>
    );
  }

  const groups: { key: keyof Feed; label: string }[] = [
    { key: "cierranPronto", label: t.cierranPronto },
    { key: "nuevos", label: t.nuevos },
    { key: "guardados", label: t.guardados },
  ];
  const total = feed ? groups.reduce((n, g) => n + feed[g.key].length, 0) : 0;

  return (
    <div className="mt-6 space-y-8">
      <div className="flex items-center justify-between">
        <Link href="/perfil" className="text-sm text-primary hover:underline">
          {dict().perfil.edit}
        </Link>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          ↻ {t.refresh}
        </button>
      </div>
      {total === 0 && <p className="text-sm text-muted-foreground">{t.emptyFeed}</p>}
      {feed &&
        groups.map(
          ({ key, label }) =>
            feed[key].length > 0 && (
              <section key={key}>
                <h2 className="mb-3 text-lg font-semibold">{label}</h2>
                <div className="space-y-3">
                  {feed[key].map((m) => (
                    <MatchCard key={m.tenderId} item={m} onAction={() => void load()} />
                  ))}
                </div>
              </section>
            ),
        )}
    </div>
  );
}
