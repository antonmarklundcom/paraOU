"use client";

import { useState } from "react";
import Link from "next/link";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

export type WhatsappStatus = "UNVERIFIED" | "PENDING" | "VERIFIED" | "FAILED" | "OPTED_OUT";

export interface WhatsappState {
  maskedPhone: string | null;
  status: WhatsappStatus;
  pendingUntil: string | null;
  allowedByPlan: boolean;
}

/**
 * WhatsApp opt-in card for /cuenta (PHASE-F1 #5): number → code → verified.
 * Deliberately minimal for v1 — the plan gate, the OTP lifetime and the
 * failure/opt-out states all live server-side; this only reflects them.
 */
export function WhatsappSettings({
  state,
  onChange,
}: {
  state: WhatsappState;
  onChange: (next: WhatsappState) => void;
}) {
  const t = dict().cuenta;
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devTransport, setDevTransport] = useState(false);

  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  const button =
    "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40";

  async function call(method: "POST" | "PUT" | "DELETE", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/whatsapp", {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message ?? "No se pudo completar la operación");
        return null;
      }
      return json.data;
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    const data = await call("POST", { phone });
    if (!data) return;
    setDevTransport(Boolean(data.devTransport));
    onChange({ ...state, status: "PENDING", maskedPhone: data.maskedPhone });
  }

  async function confirmCode() {
    const data = await call("PUT", { code });
    if (!data) return;
    setCode("");
    onChange(data as WhatsappState);
  }

  async function removeNumber() {
    const data = await call("DELETE");
    if (!data) return;
    setPhone("");
    setCode("");
    onChange(data as WhatsappState);
  }

  if (!state.allowedByPlan) {
    return (
      <div className="space-y-2 rounded-lg border border-border p-4">
        <h2 className="font-semibold">{t.whatsappTitle}</h2>
        <p className="text-sm text-muted-foreground">
          {dict().upgrade.whatsappLocked}{" "}
          <Link href="/precios" className="text-primary hover:underline">
            {dict().upgrade.cta}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <h2 className="font-semibold">{t.whatsappTitle}</h2>
      <p className="text-sm text-muted-foreground">{t.whatsappHint}</p>

      {state.status === "VERIFIED" && (
        <p className="text-sm font-medium text-status-open">
          ✓ {t.whatsappStatusVerified} — {state.maskedPhone}
        </p>
      )}
      {state.status === "FAILED" && (
        <p className="text-sm text-status-closed">{t.whatsappStatusFailed}</p>
      )}
      {state.status === "OPTED_OUT" && (
        <p className="text-sm text-muted-foreground">{t.whatsappStatusOptedOut}</p>
      )}

      {state.status === "PENDING" ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {t.whatsappStatusPending} — {state.maskedPhone}
          </p>
          {devTransport && (
            <p className="text-xs text-muted-foreground">{t.whatsappDevTransport}</p>
          )}
          <label className="block text-sm">
            {t.whatsappCode}
            <input
              className={cn(input, "mt-1")}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t.whatsappCodePlaceholder}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label={t.whatsappCode}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || code.length < 4}
              onClick={() => void confirmCode()}
            >
              {t.whatsappConfirm}
            </button>
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              disabled={busy}
              onClick={() => void removeNumber()}
            >
              {t.whatsappRemove}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm">
            {t.whatsappPhone}
            <input
              className={cn(input, "mt-1")}
              inputMode="tel"
              autoComplete="tel"
              placeholder={t.whatsappPhonePlaceholder}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label={t.whatsappPhone}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy || phone.trim().length < 6}
              onClick={() => void sendCode()}
            >
              {state.status === "VERIFIED" ? t.whatsappResend : t.whatsappSendCode}
            </button>
            {state.maskedPhone && (
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                disabled={busy}
                onClick={() => void removeNumber()}
              >
                {t.whatsappRemove}
              </button>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-status-closed">{error}</p>}
      <p className="text-xs text-muted-foreground">{t.whatsappStopHint}</p>
    </div>
  );
}
