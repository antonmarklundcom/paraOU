import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenderDetail } from "@/lib/api/tenders";
import { ApiError } from "@/lib/api/http";
import { getPygPerUsd } from "@/lib/money";
import { dict } from "@/lib/i18n";
import { Card, StatusBadge, Tag } from "@/components/ui";
import { TenderActions } from "@/components/TenderActions";
import { AiSummary } from "@/components/AiSummary";
import { DocumentAnalysis } from "@/components/DocumentAnalysis";
import { AwardOutcome } from "@/components/AwardOutcome";
import {
  formatGs,
  formatUsdApprox,
  formatDate,
  deadlinePhrase,
  referencePercentLabel,
} from "@/lib/format";
import { pickDecidingAward } from "@/lib/awards";

export const dynamic = "force-dynamic";

async function load(ocid: string) {
  try {
    return await getTenderDetail(ocid);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ocid: string }>;
}): Promise<Metadata> {
  const { ocid } = await params;
  const tender = await load(ocid);
  if (!tender) return { title: "No encontrada" };
  const desc =
    tender.description?.slice(0, 160) ?? `${tender.title} — ${tender.buyer?.name ?? "DNCP"}`;
  return {
    title: tender.title,
    description: desc,
    alternates: { canonical: `/licitaciones/${encodeURIComponent(ocid)}` },
    openGraph: { title: tender.title, description: desc, type: "article" },
  };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{children}</dd>
    </div>
  );
}

export default async function TenderDetailPage({ params }: { params: Promise<{ ocid: string }> }) {
  const { ocid } = await params;
  const [tender, usdRate] = await Promise.all([load(ocid), getPygPerUsd()]);
  if (!tender) notFound();

  const t = dict().detail;
  const usd = formatUsdApprox(tender.amountMax, usdRate);
  const decidingAward = tender.status === "AWARDED" ? pickDecidingAward(tender.awards) : null;
  const closingSoon =
    tender.daysUntilDeadline !== null &&
    tender.daysUntilDeadline >= 0 &&
    tender.daysUntilDeadline <= 7;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: tender.title,
    description: tender.description ?? undefined,
    serviceType: tender.categoryName ?? undefined,
    provider: tender.buyer
      ? { "@type": "GovernmentOrganization", name: tender.buyer.name }
      : undefined,
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link href="/licitaciones" className="text-sm text-muted-foreground hover:text-primary">
        ← {dict().overview.title}
      </Link>

      {/* Header + countdown hero */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <StatusBadge status={tender.status} daysUntilDeadline={tender.daysUntilDeadline} />
          <h1 className="mt-1 text-2xl font-bold leading-tight">{tender.title}</h1>
          {tender.buyer && (
            <p className="mt-1 text-sm text-muted-foreground">
              <Link
                href={`/compradores/${encodeURIComponent(tender.buyer.id)}`}
                className="hover:text-primary hover:underline"
              >
                {tender.buyer.name}
              </Link>
              {tender.department ? ` · ${tender.department}` : ""}
            </p>
          )}
        </div>
        <div className={`text-right ${closingSoon ? "text-status-closing" : ""}`}>
          <div className="text-lg font-bold">{deadlinePhrase(tender.daysUntilDeadline)}</div>
          {tender.deadlineAt && (
            <div className="text-sm text-muted-foreground">{formatDate(tender.deadlineAt)}</div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <TenderActions ocid={tender.ocid} hasDeadline={Boolean(tender.deadlineAt)} />
      </div>

      {tender.aiSummary && <AiSummary tenderId={tender.id} summary={tender.aiSummary} />}

      {decidingAward?.amount && (
        <AwardOutcome
          tenderId={tender.id}
          winnerName={decidingAward.supplier?.name ?? "proveedor no especificado"}
          priceLabel={formatGs(decidingAward.amount)}
          percentLabel={referencePercentLabel(decidingAward.amount, tender.amountMax)}
        />
      )}

      {/* Key facts */}
      <Card className="mt-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">{t.keyFacts}</h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Fact label={t.amount}>
            {formatGs(tender.amountMax)}
            {usd && <span className="ml-1 font-normal text-muted-foreground">({usd})</span>}
          </Fact>
          <Fact label={t.method}>{tender.procurementMethod ?? "—"}</Fact>
          <Fact label={t.category}>
            {tender.categoryName ? <Tag>{tender.categoryName}</Tag> : "—"}
          </Fact>
          <Fact label={t.published}>{formatDate(tender.publishedAt)}</Fact>
          <Fact label={t.inquiryDeadline}>{formatDate(tender.inquiryDeadlineAt)}</Fact>
          <Fact label={t.bidDeadline}>{formatDate(tender.deadlineAt)}</Fact>
        </dl>
      </Card>

      {/* Timeline */}
      {tender.timeline.length > 0 && (
        <Card className="mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.timeline}</h2>
          <ol className="space-y-2 text-sm">
            {tender.timeline.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="text-muted-foreground">{formatDate(e.at)}</span>
                <span>
                  {e.type}
                  {e.field ? ` · ${e.field}` : ""}
                  {e.newValue ? `: ${e.newValue}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Awards */}
      <Card className="mt-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Adjudicaciones</h2>
        {tender.awards.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.noAwards}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {tender.awards.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2">
                <span>
                  {a.supplier ? (
                    <Link
                      href={`/proveedores/${encodeURIComponent(a.supplier.id)}`}
                      className="hover:text-primary hover:underline"
                    >
                      {a.supplier.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </span>
                <span className="font-medium">{formatGs(a.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Buyer history teaser */}
      {tender.buyerHistory.length > 0 && (
        <Card className="mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">{t.buyerHistory}</h2>
          <ul className="space-y-2 text-sm">
            {tender.buyerHistory.map((h) => (
              <li key={h.ocid} className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/licitaciones/${encodeURIComponent(h.ocid)}`}
                  className="hover:text-primary hover:underline"
                >
                  {h.title}
                </Link>
                <span className="text-muted-foreground">
                  {h.supplier ?? "—"} · {formatGs(h.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Documents + attribution */}
      <Card className="mt-5 p-4">
        <h2 className="mb-2 text-sm font-semibold">{t.documents}</h2>
        <p className="text-xs text-muted-foreground">{t.documentsHint}</p>
        <div className="mt-2 flex flex-col gap-1 text-sm">
          {tender.documentsUrl && (
            <a
              href={tender.documentsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              📄 Pliego de bases y condiciones
            </a>
          )}
          {tender.sourceUrl && (
            <a
              href={tender.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              🔗 Página oficial DNCP
            </a>
          )}
        </div>
      </Card>

      <DocumentAnalysis ocid={tender.ocid} hasDocuments={Boolean(tender.documentsUrl)} />

      <p className="mt-5 text-xs text-muted-foreground">
        ⚠️ {t.verifyOfficial} · {dict().overview.source}
        {tender.dncpId ? ` · N° ${tender.dncpId}` : ""}
      </p>
    </main>
  );
}
