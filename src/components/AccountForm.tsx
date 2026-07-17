"use client";

import { useState } from "react";

export function AccountForm({
  locale,
  alertChannel,
  alertFrequency,
}: {
  locale: string;
  alertChannel: string;
  alertFrequency: string;
}) {
  const [form, setForm] = useState({ locale, alertChannel, alertFrequency });
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) setSaved(true);
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Idioma</label>
        <select
          value={form.locale}
          onChange={(e) => setForm((f) => ({ ...f, locale: e.target.value }))}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="es">Español</option>
          <option value="en">English</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Canal de alertas</label>
        <select
          value={form.alertChannel}
          onChange={(e) => setForm((f) => ({ ...f, alertChannel: e.target.value }))}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="EMAIL">Email</option>
          <option value="NONE">Ninguno</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium">Frecuencia</label>
        <select
          value={form.alertFrequency}
          onChange={(e) => setForm((f) => ({ ...f, alertFrequency: e.target.value }))}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="INSTANT">Instantánea</option>
          <option value="DAILY">Diaria</option>
          <option value="WEEKLY">Semanal</option>
          <option value="NONE">Ninguna</option>
        </select>
      </div>
      <button
        type="button"
        onClick={() => void save()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {saved ? "✓ Guardado" : "Guardar"}
      </button>
    </div>
  );
}
