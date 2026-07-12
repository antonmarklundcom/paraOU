"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { dict } from "@/lib/i18n";

/**
 * "Guardar búsqueda" (PHASE-5 #2): serializes the current URL's query string into
 * a SavedSearch. Requires sign-in — anonymous visitors get a link to /login.
 */
export function SaveSearchButton() {
  const { status } = useSession();
  const t = dict().saveSearch;
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  async function save() {
    const name = window.prompt(t.namePrompt);
    if (!name) return;
    setState("saving");
    const params = Object.fromEntries(new URL(window.location.href).searchParams.entries());
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, params }),
    });
    setState(res.ok ? "saved" : "idle");
  }

  if (status !== "authenticated") {
    return (
      <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
        🔖 {t.signInFirst}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
    >
      🔖 {state === "saved" ? t.saved : t.button}
    </button>
  );
}
