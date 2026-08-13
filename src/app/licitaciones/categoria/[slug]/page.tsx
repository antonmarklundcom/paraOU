import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { searchTenders } from "@/lib/api/tenders";
import { getFilterOptions, getCategoryDepartmentCombos } from "@/lib/api/meta";
import { getPygPerUsd } from "@/lib/money";
import { dict } from "@/lib/i18n";
import { serialize } from "@/lib/urlParams";
import { departmentSlug, findCategoryBySlug } from "@/lib/seo";
import { SeoLandingPage, type RelatedLink } from "@/components/SeoLandingPage";

// SEO landing pages (PLAN.md Phase G) — same rendering convention as the other
// public/SEO routes in this app (`/licitaciones`, `/licitaciones/[ocid]`,
// `/compradores/[id]`): force-dynamic, not ISR. The underlying data is already
// cached 1h at the query layer (getFilterOptions/searchTenders), so this stays
// fast without the extra hazard of a full-page cache serving a stale 404 for an
// hour whenever the taxonomy changes between deploys.
export const dynamic = "force-dynamic";

async function loadCategory(slug: string) {
  const options = await getFilterOptions();
  return findCategoryBySlug(options.categories, slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) return { title: "Categoría no encontrada" };
  const name = category.name ?? category.code;
  const title = `Licitaciones de ${name} en Paraguay — DNCP`;
  const description = `Explorá licitaciones públicas de ${name} en Paraguay: estado, montos, comprador y fecha de cierre. Datos abiertos de la DNCP, gratis y sin registro.`;
  return {
    title,
    description,
    alternates: { canonical: `/licitaciones/categoria/${slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function CategoryLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await loadCategory(slug);
  if (!category) notFound();
  const name = category.name ?? category.code;

  const [result, usdRate, combos] = await Promise.all([
    searchTenders({
      currency: "PYG",
      sort: "deadline",
      limit: 20,
      category: [category.code],
    } as Parameters<typeof searchTenders>[0]),
    getPygPerUsd(),
    getCategoryDepartmentCombos(),
  ]);

  const t = dict();
  const related: RelatedLink[] = combos
    .filter((c) => c.categoryCode === category.code)
    .slice(0, 12)
    .map((c) => ({
      label: c.department,
      href: `/licitaciones/categoria/${slug}/${departmentSlug(c.department)}`,
      count: c.count,
    }));

  const queryString = serialize({ category: category.code });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Licitaciones de ${name} en Paraguay`,
    description: `Licitaciones públicas de ${name} publicadas por la DNCP.`,
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/licitaciones/categoria/${slug}`,
    isPartOf: { "@type": "WebSite", name: "ParaOU" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: "/" },
        { "@type": "ListItem", position: 2, name: "Licitaciones", item: "/licitaciones" },
        { "@type": "ListItem", position: 3, name, item: `/licitaciones/categoria/${slug}` },
      ],
    },
  };

  return (
    <SeoLandingPage
      h1={`${t.seoLanding.breadcrumbTenders} de ${name}`}
      intro={`Todas las licitaciones públicas de ${name} en Paraguay — ${t.seoLanding.introSource}`}
      result={result}
      usdRate={usdRate}
      queryString={queryString}
      relatedTitle={related.length > 0 ? t.seoLanding.relatedDepartments : undefined}
      related={related}
      fullFilterHref={`/licitaciones${queryString}`}
      jsonLd={jsonLd}
    />
  );
}
