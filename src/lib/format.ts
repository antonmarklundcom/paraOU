/**
 * es-PY / America/Asuncion formatting helpers (docs/05, CLAUDE.md rule 5).
 * These run on the server and the client and must be deterministic (fixed locale +
 * timezone) so SSR output never disagrees with the client (no hydration drift, no
 * leaked UTC dates).
 */

const TZ = "America/Asuncion";
const LOCALE = "es-PY";

const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });

/** Compact guaraní amount: "Gs. 4,5 mil M", "Gs. 950 mill.", "Gs. 120.000". */
export function formatGs(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "Gs. —";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "Gs. —";
  if (n >= 1_000_000_000) return `Gs. ${nf1.format(n / 1_000_000_000)} mil M`;
  if (n >= 1_000_000) return `Gs. ${nf1.format(n / 1_000_000)} mill.`;
  return `Gs. ${nf0.format(n)}`;
}

/** Approximate USD, e.g. "~USD 320k". */
export function formatUsdApprox(
  pygAmount: string | number | null | undefined,
  pygPerUsd: number,
): string | null {
  if (pygAmount === null || pygAmount === undefined || pygAmount === "" || !pygPerUsd) return null;
  const n = (typeof pygAmount === "string" ? Number(pygAmount) : pygAmount) / pygPerUsd;
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `~USD ${nf1.format(n / 1_000_000)}M`;
  if (n >= 1_000) return `~USD ${nf0.format(n / 1_000)}k`;
  return `~USD ${nf0.format(n)}`;
}

const dateFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const dateShortFmt = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: "numeric",
  month: "short",
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateFmt.format(d);
}

export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dateShortFmt.format(d);
}

/**
 * "12% por debajo de la referencia" / "8% por encima de la referencia" — how a
 * winning award compares to the tender's reference/estimated amount (PHASE-F4
 * award notifications). Null when there's nothing to compare against.
 */
export function referencePercentLabel(
  winningAmount: string | number | null | undefined,
  reference: string | number | null | undefined,
): string | null {
  if (reference === null || reference === undefined || reference === "") return null;
  if (winningAmount === null || winningAmount === undefined || winningAmount === "") return null;
  const ref = typeof reference === "string" ? Number(reference) : reference;
  const win = typeof winningAmount === "string" ? Number(winningAmount) : winningAmount;
  if (!Number.isFinite(ref) || ref <= 0 || !Number.isFinite(win)) return null;
  const pct = Math.round(Math.abs(((ref - win) / ref) * 100));
  if (pct === 0) return "igual a la referencia";
  return ref > win ? `${pct}% por debajo de la referencia` : `${pct}% por encima de la referencia`;
}

/** Human deadline phrase from a precomputed day delta (computed server-side). */
export function deadlinePhrase(days: number | null | undefined): string {
  if (days === null || days === undefined) return "Sin fecha límite";
  if (days < 0) return "Cerrada";
  if (days === 0) return "Cierra hoy";
  if (days === 1) return "Cierra mañana";
  return `Cierra en ${days} días`;
}
