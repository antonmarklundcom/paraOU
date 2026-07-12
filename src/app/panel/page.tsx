import type { Metadata } from "next";
import { dict } from "@/lib/i18n";
import { PanelFeed } from "./PanelFeed";

export const metadata: Metadata = {
  title: "Mi panel",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/** /panel — the personalized match feed (PHASE-4 deliverable 5). Client-driven:
 * the anonymous profile token lives in localStorage, so SSR can't see it. */
export default function PanelPage() {
  const t = dict().panel;
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <PanelFeed />
    </main>
  );
}
