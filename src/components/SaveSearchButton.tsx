"use client";

import { useState } from "react";
import Link from "next/link";

/** "Guardar búsqueda" (docs/05 §1 — the conversion moment, gated behind signup). */
export function SaveSearchButton({ queryString }: { queryString: string }) {
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    const name = window.prompt("Nombre para esta búsqueda:");
    if (!name) return;
    const params = Object.fromEntries(new URLSearchParams(queryString.replace(/^\?/, "")));
    const res = await fetch("/api/saved-searches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, params }),
    });
    if (res.status === 401) {
      setNeedsSignIn(true);
      return;
    }
    const json = await res.json();
    if (json.ok) setSaved(true);
  }

  if (needsSignIn) {
    return (
      <Link href="/entrar" className="text-sm text-primary hover:underline">
        Iniciá sesión para guardar esta búsqueda
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void save()}
      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
    >
      {saved ? "✓ Guardada" : "💾 Guardar búsqueda"}
    </button>
  );
}
