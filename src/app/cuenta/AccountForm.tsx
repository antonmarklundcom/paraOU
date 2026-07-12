"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";

interface Prefs {
  email: string;
  locale: "es" | "en";
  alertChannel: "EMAIL" | "NONE";
  alertFrequency: "INSTANT" | "DAILY" | "WEEKLY";
}

/** Account settings + delete (PHASE-5 #6): locale, alert channel & frequency. */
export function AccountForm() {
  const t = dict().cuenta;
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void fetch("/api/account")
      .then((r) => r.json())
      .then((r) => setPrefs(r.data));
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

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-border p-4">
        <p className="text-sm text-muted-foreground">{prefs.email}</p>

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
            <option value="NONE">{t.alertChannelNone}</option>
          </select>
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
            <option value="INSTANT">{t.alertFrequencyInstant}</option>
            <option value="DAILY">{t.alertFrequencyDaily}</option>
            <option value="WEEKLY">{t.alertFrequencyWeekly}</option>
          </select>
        </label>

        <button
          type="button"
          onClick={() => void save()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {saved ? t.saved : t.save}
        </button>
      </div>

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
