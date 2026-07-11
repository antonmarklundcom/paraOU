import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBuyerProfile } from "@/lib/api/buyers";
import { searchTenders } from "@/lib/api/tenders";
import { ApiError } from "@/lib/api/http";
import { getPygPerUsd } from "@/lib/money";
import { Card } from "@/components/ui";
import { TenderCard } from "@/components/TenderCard";
import { formatGs } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load(id: string) {
  try {
    return await getBuyerProfile(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const buyer = await load(id);
  return buyer
    ? { title: buyer.name, alternates: { canonical: `/compradores/${id}` } }
    : { title: "Comprador" };
}

export default async function BuyerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [buyer, usdRate] = await Promise.all([load(id), getPygPerUsd()]);
  if (!buyer) notFound();

  const open = await searchTenders({
    buyer: id,
    status: ["OPEN"],
    sort: "deadline",
    limit: 10,
    currency: "PYG",
  } as Parameters<typeof searchTenders>[0]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold">{buyer.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {[buyer.level, buyer.ruc ? `RUC ${buyer.ruc}` : null].filter(Boolean).join(" · ")}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-status-open">{buyer.openTenders}</div>
          <div className="text-xs text-muted-foreground">Licitaciones abiertas</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{buyer.totalTenders}</div>
          <div className="text-xs text-muted-foreground">Total histórico</div>
        </Card>
      </div>

      {buyer.spendByCategory.length > 0 && (
        <Card className="mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">Gasto por categoría</h2>
          <ul className="space-y-1.5 text-sm">
            {buyer.spendByCategory.map((c, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{c.categoryName ?? "—"}</span>
                <span className="text-muted-foreground">
                  {formatGs(c.total)} · {c.tenders}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {open.items.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Licitaciones abiertas</h2>
          <div className="space-y-3">
            {open.items.map((t) => (
              <TenderCard key={t.ocid} tender={t} usdRate={usdRate} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
