"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { dict } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { getProfileToken, profileFetch, setProfileToken } from "@/lib/profileStore";
import { Card } from "@/components/ui";
import { MatchCard, type MatchItem } from "@/components/MatchCard";

/**
 * 3-step profile wizard (docs/05 §4): (1) free-text description (drives the
 * embedding), (2) categories with an AI suggestion button, (3) scope. Ends with the
 * instant sample matches — the aha moment. Edits load the existing profile via the
 * localStorage token and PUT (bumping the profile version → re-scoring).
 */

interface CategoryOption {
  code: string;
  name: string | null;
  count: number;
}

interface FormState {
  name: string;
  description: string;
  categoryCodes: string[];
  keywords: string;
  excludeKeywords: string;
  departments: string[];
  amountMin: string;
  amountMax: string;
  certifications: string;
}

const EMPTY: FormState = {
  name: "",
  description: "",
  categoryCodes: [],
  keywords: "",
  excludeKeywords: "",
  departments: [],
  amountMin: "",
  amountMax: "",
  certifications: "",
};

function splitCsv(s: string): string[] {
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function PerfilWizard({
  categories,
  departments,
}: {
  categories: CategoryOption[];
  departments: { value: string; count: number }[];
}) {
  const t = dict().perfil;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [isEdit, setIsEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sample, setSample] = useState<MatchItem[] | null>(null);
  const [aiDown, setAiDown] = useState(false);

  // Load existing profile for editing.
  useEffect(() => {
    if (!getProfileToken()) return;
    void profileFetch("/api/profile").then(async (res) => {
      if (!res.ok) return;
      const { data } = await res.json();
      setIsEdit(true);
      setForm({
        name: data.name,
        description: data.description,
        categoryCodes: data.categoryCodes,
        keywords: data.keywords.join(", "),
        excludeKeywords: data.excludeKeywords.join(", "),
        departments: data.departments,
        amountMin: data.amountMin ?? "",
        amountMax: data.amountMax ?? "",
        certifications: data.certifications.join(", "),
      });
    });
  }, []);

  function toggle(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  async function suggestCategories() {
    setSuggesting(true);
    setError(null);
    try {
      const res = await profileFetch("/api/profile/suggest-categories", {
        method: "POST",
        body: JSON.stringify({ description: form.description }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setForm((f) => ({
          ...f,
          categoryCodes: [...new Set([...f.categoryCodes, ...data.categoryCodes])],
        }));
      } else {
        setAiDown(true);
      }
    } catch {
      setAiDown(true);
    } finally {
      setSuggesting(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const body = JSON.stringify({
        name: form.name,
        description: form.description,
        categoryCodes: form.categoryCodes,
        keywords: splitCsv(form.keywords),
        excludeKeywords: splitCsv(form.excludeKeywords),
        departments: form.departments,
        amountMin: form.amountMin ? Number(form.amountMin) : null,
        amountMax: form.amountMax ? Number(form.amountMax) : null,
        certifications: splitCsv(form.certifications),
      });
      const res = await profileFetch("/api/profile", {
        method: isEdit ? "PUT" : "POST",
        body,
      });
      if (!res.ok) {
        setError(t.validation);
        return;
      }
      const { data } = await res.json();
      if (data.anonToken) setProfileToken(data.anonToken);

      // The aha moment: judge the top candidates now (capped at 5 LLM calls).
      const sampleRes = await profileFetch("/api/profile/sample-matches", { method: "POST" });
      if (sampleRes.ok) {
        const { data: sampleData } = await sampleRes.json();
        const feed = sampleData.feed;
        setSample(
          [...feed.cierranPronto, ...feed.nuevos, ...feed.guardados].slice(0, 5) as MatchItem[],
        );
      } else {
        setAiDown(true);
        setSample([]);
      }
      setStep(4);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  const btn = "rounded-md px-4 py-2 text-sm font-semibold";
  const primaryBtn = cn(btn, "bg-primary text-primary-foreground hover:opacity-90");
  const ghostBtn = cn(btn, "border border-border hover:bg-accent");
  const canNext1 = form.name.trim().length > 0 && form.description.trim().length >= 10;

  return (
    <div className="mx-auto max-w-2xl">
      {step <= 3 && (
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t.step} {step} {t.of} 3
        </p>
      )}

      {step === 1 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{t.step1Title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.step1Hint}</p>
          <input
            className={cn(input, "mt-4")}
            placeholder={t.namePlaceholder}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <textarea
            className={cn(input, "mt-3 min-h-40")}
            placeholder={t.descPlaceholder}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className={primaryBtn}
              disabled={!canNext1}
              onClick={() => setStep(2)}
            >
              {t.next}
            </button>
          </div>
          {!canNext1 && form.description.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{t.validation}</p>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t.step2Title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t.step2Hint}</p>
            </div>
            <button
              type="button"
              className={ghostBtn}
              onClick={() => void suggestCategories()}
              disabled={suggesting}
            >
              ✨ {suggesting ? t.suggesting : t.suggest}
            </button>
          </div>
          <div className="mt-4 flex max-h-80 flex-wrap gap-2 overflow-y-auto">
            {categories.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() =>
                  setForm({ ...form, categoryCodes: toggle(form.categoryCodes, c.code) })
                }
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  form.categoryCodes.includes(c.code)
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {c.name ?? c.code}
              </button>
            ))}
          </div>
          <div className="mt-4 flex justify-between">
            <button type="button" className={ghostBtn} onClick={() => setStep(1)}>
              {t.back}
            </button>
            <button type="button" className={primaryBtn} onClick={() => setStep(3)}>
              {t.next}
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">{t.step3Title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.step3Hint}</p>

          <p className="mt-4 text-sm font-medium">{t.departments}</p>
          <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto">
            {departments.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setForm({ ...form, departments: toggle(form.departments, d.value) })}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  form.departments.includes(d.value)
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {d.value}
              </button>
            ))}
          </div>

          <p className="mt-4 text-sm font-medium">{t.amountRange}</p>
          <div className="mt-2 flex gap-3">
            <input
              className={input}
              type="number"
              min="0"
              placeholder={t.amountMin}
              value={form.amountMin}
              onChange={(e) => setForm({ ...form, amountMin: e.target.value })}
            />
            <input
              className={input}
              type="number"
              min="0"
              placeholder={t.amountMax}
              value={form.amountMax}
              onChange={(e) => setForm({ ...form, amountMax: e.target.value })}
            />
          </div>

          <p className="mt-4 text-sm font-medium">{t.keywords}</p>
          <input
            className={cn(input, "mt-2")}
            value={form.keywords}
            onChange={(e) => setForm({ ...form, keywords: e.target.value })}
          />
          <p className="mt-4 text-sm font-medium">{t.excludeWords}</p>
          <input
            className={cn(input, "mt-2")}
            value={form.excludeKeywords}
            onChange={(e) => setForm({ ...form, excludeKeywords: e.target.value })}
          />
          <p className="mt-4 text-sm font-medium">{t.certifications}</p>
          <input
            className={cn(input, "mt-2")}
            value={form.certifications}
            onChange={(e) => setForm({ ...form, certifications: e.target.value })}
          />

          {error && <p className="mt-3 text-sm text-status-closed">{error}</p>}
          <div className="mt-5 flex justify-between">
            <button type="button" className={ghostBtn} onClick={() => setStep(2)}>
              {t.back}
            </button>
            <button
              type="button"
              className={primaryBtn}
              disabled={busy}
              onClick={() => void finish()}
            >
              {busy ? t.finishing : isEdit ? t.saveChanges : t.finish}
            </button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <div>
          <h2 className="text-lg font-semibold">{t.sampleTitle}</h2>
          {aiDown && <p className="mt-2 text-sm text-status-closing">{t.aiUnavailable}</p>}
          {sample && sample.length === 0 && !aiDown && (
            <p className="mt-2 text-sm text-muted-foreground">{t.sampleEmpty}</p>
          )}
          <div className="mt-4 space-y-3">
            {sample?.map((m) => (
              <MatchCard key={m.tenderId} item={m} readOnly />
            ))}
          </div>
          <div className="mt-6">
            <Link href="/panel" className={primaryBtn}>
              {t.toPanel}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
