import Link from "next/link";
import { dict } from "@/lib/i18n";
import { Chip } from "@/components/ui";
import { setParam, removeValue, type RawParams } from "@/lib/urlParams";
import { cn } from "@/lib/cn";

type FilterOptions = {
  statuses: { value: string; count: number }[];
  departments: { value: string; count: number }[];
  methods: { value: string; count: number }[];
  categories: { code: string; name: string | null; count: number }[];
};

function selected(params: RawParams, key: string): string[] {
  const v = params[key];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
}

/** Sort control — real links that preserve the rest of the filter state. */
export function SortControl({ params }: { params: RawParams }) {
  const t = dict().sort;
  const current = (Array.isArray(params.sort) ? params.sort[0] : params.sort) ?? "newest";
  const options: { key: string; label: string }[] = [
    { key: "relevance", label: t.relevance },
    { key: "newest", label: t.newest },
    { key: "deadline", label: t.deadline },
    { key: "amount", label: t.amount },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-1 text-muted-foreground">{t.label}:</span>
      {options.map((o) => (
        <Link
          key={o.key}
          href={`/licitaciones${setParam(params, "sort", o.key)}`}
          className={cn(
            "rounded-md px-2 py-1",
            current === o.key ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** Removable chips for every active filter. */
export function ActiveChips({ params, options }: { params: RawParams; options: FilterOptions }) {
  const t = dict();
  const catName = (code: string) => options.categories.find((c) => c.code === code)?.name ?? code;
  const chips: React.ReactNode[] = [];

  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  if (q)
    chips.push(
      <Chip key="q" removeHref={`/licitaciones${removeValue(params, "q", q)}`} label={q}>
        “{q}”
      </Chip>,
    );

  for (const s of selected(params, "status"))
    chips.push(
      <Chip
        key={`st-${s}`}
        removeHref={`/licitaciones${removeValue(params, "status", s)}`}
        label={s}
      >
        {t.status[s as keyof typeof t.status] ?? s}
      </Chip>,
    );
  for (const c of selected(params, "category"))
    chips.push(
      <Chip
        key={`c-${c}`}
        removeHref={`/licitaciones${removeValue(params, "category", c)}`}
        label={c}
      >
        {catName(c)}
      </Chip>,
    );
  for (const d of selected(params, "department"))
    chips.push(
      <Chip
        key={`d-${d}`}
        removeHref={`/licitaciones${removeValue(params, "department", d)}`}
        label={d}
      >
        {d}
      </Chip>,
    );
  for (const m of selected(params, "method"))
    chips.push(
      <Chip
        key={`m-${m}`}
        removeHref={`/licitaciones${removeValue(params, "method", m)}`}
        label={m}
      >
        {m}
      </Chip>,
    );
  if (params.deadlineWithinDays)
    chips.push(
      <Chip
        key="dl"
        removeHref={`/licitaciones${removeValue(params, "deadlineWithinDays", String(params.deadlineWithinDays))}`}
      >
        {t.filter.closingSoon}
      </Chip>,
    );

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips}
      <Link href="/licitaciones" className="text-xs text-primary hover:underline">
        {t.overview.clear}
      </Link>
    </div>
  );
}

function CheckGroup({
  title,
  name,
  params,
  items,
}: {
  title: string;
  name: string;
  params: RawParams;
  items: { value: string; label: string; count: number }[];
}) {
  const active = new Set(selected(params, name));
  if (items.length === 0) return null;
  return (
    <fieldset className="border-t border-border py-3">
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      <div className="space-y-1.5">
        {items.map((it) => (
          <label key={it.value} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name={name}
              value={it.value}
              defaultChecked={active.has(it.value)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <span className="flex-1 truncate">{it.label}</span>
            <span className="text-xs text-muted-foreground">{it.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Filter rail — a plain GET <form>, so filtering works with JavaScript disabled and
 * every state is URL-serialized (shareable/savable). docs/05 §1.
 */
export function FilterRail({ params, options }: { params: RawParams; options: FilterOptions }) {
  const t = dict();
  const q = Array.isArray(params.q) ? params.q[0] : params.q;
  const sort = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const amountMin = Array.isArray(params.amountMin) ? params.amountMin[0] : params.amountMin;
  const amountMax = Array.isArray(params.amountMax) ? params.amountMax[0] : params.amountMax;

  return (
    <form method="get" action="/licitaciones" className="text-sm">
      {sort && <input type="hidden" name="sort" value={sort} />}

      <input
        type="search"
        name="q"
        defaultValue={q ?? ""}
        placeholder={t.overview.search}
        className="w-full rounded-md border border-input bg-background px-3 py-2"
      />

      <CheckGroup
        title={t.filter.status}
        name="status"
        params={params}
        items={options.statuses.map((s) => ({
          value: s.value,
          label: t.status[s.value as keyof typeof t.status] ?? s.value,
          count: s.count,
        }))}
      />
      <CheckGroup
        title={t.filter.category}
        name="category"
        params={params}
        items={options.categories
          .slice(0, 8)
          .map((c) => ({ value: c.code, label: c.name ?? c.code, count: c.count }))}
      />
      <CheckGroup
        title={t.filter.department}
        name="department"
        params={params}
        items={options.departments
          .slice(0, 10)
          .map((d) => ({ value: d.value, label: d.value, count: d.count }))}
      />
      <CheckGroup
        title={t.filter.method}
        name="method"
        params={params}
        items={options.methods
          .slice(0, 8)
          .map((m) => ({ value: m.value, label: m.value, count: m.count }))}
      />

      <fieldset className="border-t border-border py-3">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t.filter.amount}
        </legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            name="amountMin"
            defaultValue={amountMin ?? ""}
            placeholder="mín"
            className="w-full rounded-md border border-input bg-background px-2 py-1"
          />
          <input
            type="number"
            name="amountMax"
            defaultValue={amountMax ?? ""}
            placeholder="máx"
            className="w-full rounded-md border border-input bg-background px-2 py-1"
          />
          <select
            name="currency"
            defaultValue={(params.currency as string) ?? "PYG"}
            className="rounded-md border border-input bg-background px-2 py-1"
          >
            <option value="PYG">Gs.</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="border-t border-border py-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="deadlineWithinDays"
            value="7"
            defaultChecked={Boolean(params.deadlineWithinDays)}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          {t.filter.closingSoon}
        </label>
      </fieldset>

      <div className="flex gap-2 border-t border-border pt-3">
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground hover:opacity-90"
        >
          {t.overview.apply}
        </button>
        <Link
          href="/licitaciones"
          className="rounded-md border border-border px-3 py-2 hover:bg-accent"
        >
          {t.overview.clear}
        </Link>
      </div>
    </form>
  );
}
