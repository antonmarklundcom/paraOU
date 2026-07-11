"use client";

import { useEffect, useState } from "react";

/** Light/dark toggle. Persists to localStorage; the pre-paint script in layout
 * applies the stored choice before hydration. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore storage failures (private mode)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="rounded-md border border-border px-2 py-1 text-sm hover:bg-accent"
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
