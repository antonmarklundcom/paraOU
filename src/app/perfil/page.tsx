"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";

/**
 * Company profile wizard (docs/05 §4, PHASE-4 step 2): 3 steps, < 3 minutes.
 * (1) free-text description → drives the embedding, (2) categories (AI-suggested
 * from the description) + geo scope, (3) amount range + certifications → submit →
 * instant sample matches (the "aha moment").
 */

interface CategorySuggestion {
  code: string;
  name: string;
}

interface SampleMatch {
  ocid: string;
  title: string;
  score: number;
  verdict: string;
  reasoning: string;
  cautions: string[];
}

export default function PerfilWizardPage() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [categoryCodes, setCategoryCodes] = useState<string[]>([]);
  const [keywords, setKeywords] = useState("");
  const [excludeKeywords, setExcludeKeywords] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [certifications, setCertifications] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<SampleMatch[] | null>(null);

  useEffect(() => {
    fetch("/api/meta/filters")
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setDepartmentOptions(j.data.departments.map((d: { value: string }) => d.value));
      })
      .catch(() => {});
  }, []);

  async function suggestCategories() {
    if (description.trim().length < 10) return;
    setSuggesting(true);
    try {
      const res = await fetch("/api/profile/suggest-categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (json.ok) setSuggestions(json.data.suggestions);
    } finally {
      setSuggesting(false);
    }
  }

  function toggleCategory(code: string) {
    setCategoryCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }
  function toggleDepartment(dep: string) {
    setDepartments((prev) => (prev.includes(dep) ? prev.filter((d) => d !== dep) : [...prev, dep]));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name || "Mi empresa",
          description,
          categoryCodes,
          keywords: keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          excludeKeywords: excludeKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          departments,
          amountMin: amountMin ? Number(amountMin) : undefined,
          amountMax: amountMax ? Number(amountMax) : undefined,
          certifications: certifications
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError("No se pudo guardar el perfil. Revisá los datos e intentá de nuevo.");
        return;
      }
      const sampleRes = await fetch("/api/profile/sample-matches");
      const sampleJson = await sampleRes.json();
      setMatches(sampleJson.ok ? sampleJson.data.matches : []);
    } finally {
      setSaving(false);
    }
  }

  if (matches !== null) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold">¡Listo! Estos son tus primeros matches</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Basado en tu perfil, así de relevantes son algunas licitaciones abiertas.
        </p>
        <div className="mt-6 space-y-3">
          {matches.length === 0 && (
            <Card className="p-4 text-sm text-muted-foreground">
              Todavía no encontramos licitaciones abiertas que coincidan. Volvé a intentar más tarde
              o ajustá tu perfil.
            </Card>
          )}
          {matches.map((m) => (
            <Card key={m.ocid} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/licitaciones/${encodeURIComponent(m.ocid)}`}
                  className="font-semibold hover:underline"
                >
                  {m.title}
                </Link>
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  {m.score}%
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{m.reasoning}</p>
            </Card>
          ))}
        </div>
        <Link
          href="/panel"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Ver mi panel completo
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">Creá tu perfil de empresa</h1>
      <p className="mt-1 text-sm text-muted-foreground">Paso {step} de 3</p>

      {step === 1 && (
        <Card className="mt-4 p-4">
          <label className="block text-sm font-medium">Nombre de tu empresa</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Constructora del Este S.A."
          />
          <label className="mt-4 block text-sm font-medium">
            Contanos qué hace tu empresa, con tus propias palabras
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Ej: empresa constructora en Itapúa, obras viales hasta Gs. 5.000 mill."
          />
          <button
            type="button"
            disabled={description.trim().length < 10}
            onClick={() => {
              void suggestCategories();
              setStep(2);
            }}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            Siguiente
          </button>
        </Card>
      )}

      {step === 2 && (
        <Card className="mt-4 p-4">
          <label className="block text-sm font-medium">Categorías sugeridas</label>
          <p className="mt-1 text-xs text-muted-foreground">
            {suggesting ? "Analizando tu descripción…" : "Elegí las que apliquen."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s.code}
                type="button"
                onClick={() => toggleCategory(s.code)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  categoryCodes.includes(s.code)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent"
                }`}
              >
                {s.name}
              </button>
            ))}
            {!suggesting && suggestions.length === 0 && (
              <span className="text-xs text-muted-foreground">Sin sugerencias todavía.</span>
            )}
          </div>

          <label className="mt-4 block text-sm font-medium">
            Palabras clave (separadas por coma)
          </label>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="pavimentación, obras viales"
          />
          <label className="mt-4 block text-sm font-medium">Excluir (no hacemos esto)</label>
          <input
            value={excludeKeywords}
            onChange={(e) => setExcludeKeywords(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="informática, software"
          />

          <label className="mt-4 block text-sm font-medium">
            Departamentos (vacío = todo el país)
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {departmentOptions.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDepartment(d)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  departments.includes(d)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border hover:bg-accent"
                }`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              Atrás
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Siguiente
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card className="mt-4 p-4">
          <label className="block text-sm font-medium">Rango de monto de contrato (Gs.)</label>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              value={amountMin}
              onChange={(e) => setAmountMin(e.target.value)}
              placeholder="mín"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={amountMax}
              onChange={(e) => setAmountMax(e.target.value)}
              placeholder="máx"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <label className="mt-4 block text-sm font-medium">
            Certificaciones (separadas por coma)
          </label>
          <input
            value={certifications}
            onChange={(e) => setCertifications(e.target.value)}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="ISO 9001"
          />

          {error && <p className="mt-3 text-sm text-status-closing">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
            >
              Atrás
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submit()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Ver mis matches"}
            </button>
          </div>
        </Card>
      )}
    </main>
  );
}
