import type { Metadata } from "next";
import type { Plan } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { dict } from "@/lib/i18n";
import { limitsFor } from "@/lib/plan";
import { formatGs, formatDate } from "@/lib/format";
import { Card } from "@/components/ui";
import { plannedPurchaseQuerySchema, searchPlannedPurchases } from "@/lib/api/plannedPurchases";
import { type RawParams, setParam } from "@/lib/urlParams";

export const metadata: Metadata = {
  title: "Planificación (PAC)",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

/**
 * /planificacion — "PAC early-warning" (F3, docs/07 #1): Business-tier feed of
 * DNCP `planificaciones` (Plan Anual de Contrataciones) entries, surfaced ahead
 * of the tender itself. Server-rendered like /licitaciones (session-gated
 * instead of anon-token gated, so SSR can see it — unlike /panel).
 */
export default async function PlanificacionPage({
  searchParams,
}: {
  searchParams: Promise<RawParams>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const t = dict().planificacion;
  const plan = session.user.plan as Plan;

  if (!limitsFor(plan).plannedPurchases) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        <Card className="mt-6 p-6 text-center">
          <p className="text-muted-foreground">🔒 {t.businessOnly}</p>
          <Link
            href="/precios"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {dict().upgrade.cta}
          </Link>
        </Card>
      </main>
    );
  }

  const raw = (await searchParams) ?? {};
  const parsed = plannedPurchaseQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : plannedPurchaseQuerySchema.parse({});
  const result = await searchPlannedPurchases(query);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>

      {result.items.length === 0 ? (
        <Card className="mt-6 p-6 text-center text-muted-foreground">{t.empty}</Card>
      ) : (
        <div className="mt-6 space-y-3">
          {result.items.map((item) => (
            <Card key={item.id} className="p-4">
              <h2 className="font-semibold">{item.title}</h2>
              {item.description && (
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              )}
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                {item.buyerName && (
                  <div>
                    <dt className="font-medium">{t.buyer}</dt>
                    <dd>{item.buyerName}</dd>
                  </div>
                )}
                {item.categoryName && (
                  <div>
                    <dt className="font-medium">{t.category}</dt>
                    <dd>{item.categoryName}</dd>
                  </div>
                )}
                {item.estimatedAmount && (
                  <div>
                    <dt className="font-medium">{t.estimatedAmount}</dt>
                    <dd>{formatGs(item.estimatedAmount)}</dd>
                  </div>
                )}
                {(item.estimatedQuarter || item.estimatedDate) && (
                  <div>
                    <dt className="font-medium">{t.quarterLabel}</dt>
                    <dd>{item.estimatedQuarter ?? formatDate(item.estimatedDate)}</dd>
                  </div>
                )}
              </dl>
            </Card>
          ))}
        </div>
      )}

      {result.total > result.items.length && (
        <div className="mt-6 flex justify-center gap-3 text-sm">
          {query.page > 1 && (
            <Link
              href={`/planificacion${setParam(raw, "page", String(query.page - 1))}`}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-accent"
            >
              ←
            </Link>
          )}
          {query.page * query.limit < result.total && (
            <Link
              href={`/planificacion${setParam(raw, "page", String(query.page + 1))}`}
              className="rounded-md border border-border px-3 py-1.5 hover:bg-accent"
            >
              →
            </Link>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        {t.source} · {t.disclaimer}
      </p>
    </main>
  );
}
