import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getSupplierProfile } from "@/lib/api/suppliers";
import { ApiError } from "@/lib/api/http";
import { Card } from "@/components/ui";
import { formatGs } from "@/lib/format";

export const dynamic = "force-dynamic";

async function load(id: string) {
  try {
    return await getSupplierProfile(id);
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
  const s = await load(id);
  return s
    ? { title: s.name, alternates: { canonical: `/proveedores/${id}` } }
    : { title: "Proveedor" };
}

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await load(id);
  if (!supplier) notFound();

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold">{supplier.name}</h1>
      {supplier.ruc && <p className="mt-1 text-sm text-muted-foreground">RUC {supplier.ruc}</p>}

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{supplier.totalAwards}</div>
          <div className="text-xs text-muted-foreground">Adjudicaciones</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold">{formatGs(supplier.totalWonValue)}</div>
          <div className="text-xs text-muted-foreground">Valor adjudicado</div>
        </Card>
      </div>

      {supplier.categories.length > 0 && (
        <Card className="mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">Categorías</h2>
          <ul className="space-y-1.5 text-sm">
            {supplier.categories.map((c, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span>{c.categoryName ?? "—"}</span>
                <span className="text-muted-foreground">{c.awards}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {supplier.topBuyers.length > 0 && (
        <Card className="mt-5 p-4">
          <h2 className="mb-3 text-sm font-semibold">Principales compradores</h2>
          <ul className="space-y-1.5 text-sm">
            {supplier.topBuyers.map((b) => (
              <li key={b.id} className="flex justify-between gap-2">
                <Link
                  href={`/compradores/${encodeURIComponent(b.id)}`}
                  className="hover:text-primary hover:underline"
                >
                  {b.name}
                </Link>
                <span className="text-muted-foreground">
                  {formatGs(b.total)} · {b.awards}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
