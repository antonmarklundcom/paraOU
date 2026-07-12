"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const t = dict().auth;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const res = await signIn("resend", { email, redirect: false });
    setState(res?.error ? "error" : "sent");
  }

  const input =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const primaryBtn =
    "w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60";

  if (state === "sent") {
    return <p className="text-sm text-status-open">{t.checkEmail}</p>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="email">
          {t.emailLabel}
        </label>
        <input
          id="email"
          type="email"
          required
          className={input}
          placeholder={t.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" disabled={state === "sending"} className={primaryBtn}>
          {state === "sending" ? t.sending : t.sendLink}
        </button>
        {state === "error" && <p className="text-sm text-status-closed">{t.errorGeneric}</p>}
      </form>

      {googleEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {t.orDivider}
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={() => void signIn("google")}
            className={cn(
              "w-full rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-accent",
            )}
          >
            {t.withGoogle}
          </button>
        </>
      )}
    </div>
  );
}
