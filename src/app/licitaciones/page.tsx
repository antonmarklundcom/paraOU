import type { Metadata } from "next";
import { searchTenders, tenderQuerySchema } from "@/lib/api/tenders";
import { getFilterOptions } from "@/lib/api/meta";
import { ingestionStatus } from "@/lib/api/status";
import { getPygPerUsd } from "@/lib/money";
import { dict } from "@/lib/i18n";
import { serialize, type RawParams } from "@/lib/urlParams";
import { FilterRail, SortControl, ActiveChips } from "@/components/overview";
import { TenderList } from "@/components/TenderList";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Licitaciones",
  description: "Buscá y filtrá licitaciones públicas de Paraguay. Fuente: DNCP.",
  alternates: { canonical: "/licitaciones" },
};

export default async function LicitacionesPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const raw = (await searchParams) ?? {};
  const t = dict();

  // Parse for the DB query, but degrade gracefully on bad input (public page).
  const parsed = tenderQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : tenderQuerySchema.parse({});

  const [result, options, usdRate, status] = await Promise.all([
    searchTenders(query),
    getFilterOptions(),
    getPygPerUsd(),
    ingestionStatus(),
  ]);

  const count = result.totalEstimate + (result.totalCapped ? "+" : "");
  const noun = result.totalEstimate === 1 ? t.overview.resultsOne : t.overview.resultsMany;
  const qs = serialize(raw);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold">{t.overview.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {count} {noun}
      </p>

      {status.fixtures && (
        <div className="mt-4 rounded-md border border-status-closing/40 bg-status-closing/10 px-3 py-2 text-sm text-status-closing">
          {t.overview.fixturesBanner}
        </div>
      )}
      {!status.fixtures && status.stale && (
        <div className="mt-4 rounded-md border border-status-closing/40 bg-status-closing/10 px-3 py-2 text-sm text-status-closing">
          {t.overview.staleBanner}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-6 md:flex-row">
        {/* Filters: native collapsible on mobile, sticky sidebar on desktop */}
        <details className="rounded-lg border border-border p-4 md:hidden">
          <summary className="cursor-pointer font-semibold">{t.overview.filters}</summary>
          <div className="mt-3">
            <FilterRail params={raw} options={options} />
          </div>
        </details>
        <aside className="hidden w-72 shrink-0 md:block">
          <div className="sticky top-20">
            <FilterRail params={raw} options={options} />
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SortControl params={raw} />
          </div>
          <div className="mb-4">
            <ActiveChips params={raw} options={options} />
          </div>
          <TenderList
            initialItems={result.items}
            initialCursor={result.nextCursor}
            queryString={qs}
            usdRate={usdRate}
          />
        </section>
      </div>
    </main>
  );
}
