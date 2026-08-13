import Link from "next/link";
import type { TenderListResult } from "@/lib/api/tenders";
import { dict } from "@/lib/i18n";
import { TenderList } from "@/components/TenderList";
import { FreshnessBadge } from "@/components/FreshnessBadge";

export interface RelatedLink {
  label: string;
  href: string;
  count?: number;
}

/**
 * Shared shell for the free category/department/combo SEO landing pages (PLAN.md
 * Phase G — "the free tender pages ARE the SEO engine, never gate them"). Reuses
 * the exact same `TenderList` + `/api/tenders` pagination as `/licitaciones`, just
 * pre-filtered, so "Ver más" keeps working and the data is always live.
 */
export function SeoLandingPage({
  h1,
  intro,
  result,
  usdRate,
  queryString,
  relatedTitle,
  related,
  fullFilterHref,
  jsonLd,
}: {
  h1: string;
  intro: string;
  result: TenderListResult;
  usdRate: number;
  queryString: string;
  relatedTitle?: string;
  related?: RelatedLink[];
  fullFilterHref: string;
  jsonLd: Record<string, unknown>;
}) {
  const t = dict();
  const count = result.totalEstimate + (result.totalCapped ? "+" : "");
  const noun = result.totalEstimate === 1 ? t.overview.resultsOne : t.overview.resultsMany;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav aria-label="breadcrumb" className="text-xs text-muted-foreground">
        <Link href="/" className="hover:text-primary hover:underline">
          {t.seoLanding.breadcrumbHome}
        </Link>{" "}
        ›{" "}
        <Link href="/licitaciones" className="hover:text-primary hover:underline">
          {t.seoLanding.breadcrumbTenders}
        </Link>{" "}
        › <span aria-current="page">{h1}</span>
      </nav>

      <h1 className="mt-2 text-2xl font-bold">{h1}</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{intro}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {count} {noun}
        </span>
        <FreshnessBadge />
      </div>

      {related && related.length > 0 && (
        <section className="mt-4">
          {relatedTitle && (
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {relatedTitle}
            </h2>
          )}
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary"
              >
                {r.label}
                {r.count !== undefined ? ` · ${r.count}` : ""}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5">
        {result.items.length === 0 ? (
          <p className="rounded-lg border border-border p-6 text-center text-sm text-muted-foreground">
            {t.seoLanding.empty}
          </p>
        ) : (
          <TenderList
            initialItems={result.items}
            initialCursor={result.nextCursor}
            queryString={queryString}
            usdRate={usdRate}
          />
        )}
      </div>

      <p className="mt-6 text-sm">
        <Link href={fullFilterHref} className="text-primary hover:underline">
          {t.seoLanding.viewAllFiltered} →
        </Link>
      </p>
    </main>
  );
}
