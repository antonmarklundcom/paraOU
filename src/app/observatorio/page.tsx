import type { Metadata } from "next";
import Link from "next/link";
import { getObservatorioStats } from "@/lib/api/observatorio";
import { categorySlug } from "@/lib/seo";
import { dict } from "@/lib/i18n";
import { Card } from "@/components/ui";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { formatGs, formatDate, deadlinePhrase } from "@/lib/format";

// Same convention as the other public/SEO pages (`/licitaciones`, `/observatorio`'s
// sibling landing pages): force-dynamic. The stats themselves are already cached
// 1h at the query layer (getObservatorioStats), so this stays fast without a
// full-page cache risking an hour-stale snapshot for a page that's meant to be
// "this week's numbers".
export const dynamic = "force-dynamic";

const description =
  "Estadísticas públicas y gratuitas del mercado de licitaciones de Paraguay: monto en juego, rubros con más movimiento, organismos que más adjudican y licitaciones que cierran pronto. Fuente: DNCP.";

export const metadata: Metadata = {
  title: "Observatorio de licitaciones",
  description,
  alternates: { canonical: "/observatorio" },
  openGraph: { title: "Observatorio de licitaciones — ParaOU", description, type: "website" },
};

function daysUntil(deadline: string | null): number | null {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

export default async function ObservatorioPage() {
  const t = dict().observatorio;
  const stats = await getObservatorioStats();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Observatorio de licitaciones públicas de Paraguay",
    description,
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/observatorio`,
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: "ParaOU" },
    temporalCoverage: stats.generatedAt,
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t.subtitle}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {stats.totalTenders.toLocaleString("es-PY")} {t.totalTenders}
        </span>
        <FreshnessBadge />
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.thisWeek}
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.thisWeek.count}</div>
          <div className="text-sm text-muted-foreground">{t.newTenders}</div>
          <div className="mt-2 text-lg font-semibold">{formatGs(stats.thisWeek.totalValue)}</div>
          <div className="text-xs text-muted-foreground">{t.valuePublished}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t.thisMonth}
          </div>
          <div className="mt-2 text-3xl font-bold">{stats.thisMonth.count}</div>
          <div className="text-sm text-muted-foreground">{t.newTenders}</div>
          <div className="mt-2 text-lg font-semibold">{formatGs(stats.thisMonth.totalValue)}</div>
          <div className="text-xs text-muted-foreground">{t.valuePublished}</div>
        </Card>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.topCategories}</h2>
        <p className="text-xs text-muted-foreground">{t.topCategoriesHint}</p>
        {stats.topCategories.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">—</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {stats.topCategories.map((c, i) => (
              <li key={c.categoryCode}>
                <Link
                  href={`/licitaciones/categoria/${categorySlug(c.categoryCode, c.categoryName)}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:border-primary"
                >
                  <span>
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {c.categoryName ?? c.categoryCode}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({c.count} {t.tenders})
                    </span>
                  </span>
                  <span className="font-medium">{formatGs(c.totalValue)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.topBuyers}</h2>
        <p className="text-xs text-muted-foreground">{t.topBuyersHint}</p>
        {stats.topBuyers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">—</p>
        ) : (
          <ol className="mt-3 space-y-1.5">
            {stats.topBuyers.map((b, i) => (
              <li key={b.id}>
                <Link
                  href={`/compradores/${encodeURIComponent(b.id)}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm hover:border-primary"
                >
                  <span>
                    <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                    {b.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({b.awards} adjudicaciones)
                    </span>
                  </span>
                  <span className="font-medium">{formatGs(b.totalAwarded)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{t.closingSoon}</h2>
        <p className="text-xs text-muted-foreground">{t.closingSoonHint}</p>
        {stats.closingSoon.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">—</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {stats.closingSoon.map((tender) => (
              <li key={tender.ocid}>
                <Link
                  href={`/licitaciones/${encodeURIComponent(tender.ocid)}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-primary"
                >
                  <span>
                    {tender.title}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {[tender.buyerName, tender.department].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-status-closing">
                    {deadlinePhrase(daysUntil(tender.deadlineAt))}
                    {tender.deadlineAt ? ` · ${formatDate(tender.deadlineAt)}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        {t.methodology}
      </p>
    </main>
  );
}
