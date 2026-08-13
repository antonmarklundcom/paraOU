"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { limitsFor } from "@/lib/plan";
import { WhatsappSettings, type WhatsappState } from "./WhatsappSettings";

interface Prefs {
  email: string;
  locale: "es" | "en";
  alertChannel: "EMAIL" | "WHATSAPP" | "EMAIL_AND_WHATSAPP" | "NONE";
  alertFrequency: "INSTANT" | "DAILY" | "WEEKLY";
  plan: "FREE" | "PRO" | "BUSINESS" | "AGENCY";
}

/** Account settings + delete (PHASE-5 #6): locale, alert channel & frequency. */
export function AccountForm() {
  const t = dict().cuenta;
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsappState | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    void fetch("/api/account")
      .then((r) => r.json())
      .then((r) => setPrefs(r.data));
    void fetch("/api/account/whatsapp")
      .then((r) => r.json())
      .then((r) => setWhatsapp(r.data ?? null))
      .catch(() => setWhatsapp(null));
  }, []);

  async function save() {
    if (!prefs) return;
    setSaved(false);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        locale: prefs.locale,
        alertChannel: prefs.alertChannel,
        alertFrequency: prefs.alertFrequency,
      }),
    });
    if (res.ok) setSaved(true);
  }

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (res.ok) {
        window.location.href = (await res.json()).data.url;
      }
    } finally {
      setPortalLoading(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    const res = await fetch("/api/account", { method: "DELETE" });
    if (res.ok) {
      await signOut({ callbackUrl: "/" });
    } else {
      setDeleting(false);
    }
  }

  if (!prefs) return <p className="text-sm text-muted-foreground">…</p>;

  const select = "rounded-md border border-border bg-background px-3 py-2 text-sm";
  const allowedFrequencies = limitsFor(prefs.plan).allowedAlertFrequencies;
  // WhatsApp is only selectable once the number completed the opt-in — the API
  // rejects it otherwise (src/lib/api/account.ts), so don't offer a dead option.
  const whatsappReady = whatsapp?.allowedByPlan === true && whatsapp.status === "VERIFIED";

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">{prefs.email}</p>
          <span className="flex items-center gap-2">
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold">
              {prefs.plan}
            </span>
            {prefs.plan === "FREE" ? (
              <Link href="/precios" className="text-xs text-primary hover:underline">
                {dict().upgrade.cta}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalLoading}
                className="text-xs text-primary hover:underline"
              >
                {dict().pricing.manage}
              </button>
            )}
          </span>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.locale}</span>
          <select
            className={select}
            value={prefs.locale}
            onChange={(e) => setPrefs({ ...prefs, locale: e.target.value as Prefs["locale"] })}
          >
            <option value="es">{t.localeEs}</option>
            <option value="en">{t.localeEn}</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.alertChannel}</span>
          <select
            className={select}
            value={prefs.alertChannel}
            onChange={(e) =>
              setPrefs({ ...prefs, alertChannel: e.target.value as Prefs["alertChannel"] })
            }
          >
            <option value="EMAIL">{t.alertChannelEmail}</option>
            <option value="WHATSAPP" disabled={!whatsappReady}>
              {t.alertChannelWhatsapp}
            </option>
            <option value="EMAIL_AND_WHATSAPP" disabled={!whatsappReady}>
              {t.alertChannelBoth}
            </option>
            <option value="NONE">{t.alertChannelNone}</option>
          </select>
          {!whatsappReady && (
            <p className="mt-1 text-xs text-muted-foreground">
              {whatsapp?.allowedByPlan === false ? dict().upgrade.whatsappLocked : t.whatsappHint}
            </p>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium">{t.alertFrequency}</span>
          <select
            className={select}
            value={prefs.alertFrequency}
            onChange={(e) =>
              setPrefs({ ...prefs, alertFrequency: e.target.value as Prefs["alertFrequency"] })
            }
          >
            <option value="INSTANT" disabled={!allowedFrequencies.includes("INSTANT")}>
              {t.alertFrequencyInstant}
            </option>
            <option value="DAILY" disabled={!allowedFrequencies.includes("DAILY")}>
              {t.alertFrequencyDaily}
            </option>
            <option value="WEEKLY">{t.alertFrequencyWeekly}</option>
          </select>
          {allowedFrequencies.length < 3 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {dict().upgrade.alertFrequencyLocked}{" "}
              <Link href="/precios" className="text-primary hover:underline">
                {dict().upgrade.cta}
              </Link>
            </p>
          )}
        </label>

        <button
          type="button"
          onClick={() => void save()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {saved ? t.saved : t.save}
        </button>
      </div>

      {whatsapp && (
        <WhatsappSettings
          state={whatsapp}
          onChange={(next) => {
            setWhatsapp(next);
            // Losing the number invalidates a WhatsApp-bearing preference; the
            // server already fell back to email, so mirror that here instead of
            // leaving the form showing a channel that no longer exists.
            if (
              next.status !== "VERIFIED" &&
              (prefs.alertChannel === "WHATSAPP" || prefs.alertChannel === "EMAIL_AND_WHATSAPP")
            ) {
              setPrefs({ ...prefs, alertChannel: "EMAIL" });
            }
          }}
        />
      )}

      <div className="space-y-3 rounded-lg border border-status-closed/40 p-4">
        <h2 className="font-semibold text-status-closed">{t.dangerZone}</h2>
        <p className="text-sm text-muted-foreground">{t.deleteAccountHint}</p>
        <label className="block text-sm">
          {t.deleteConfirm}
          <input
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={confirmWord !== t.deleteConfirmWord || deleting}
          onClick={() => void deleteAccount()}
          className={cn(
            "rounded-md border border-status-closed px-4 py-2 text-sm font-semibold text-status-closed hover:bg-status-closed/10",
            "disabled:opacity-40",
          )}
        >
          {t.deleteButton}
        </button>
      </div>
    </div>
  );
}
