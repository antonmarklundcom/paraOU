import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { searchTenders } from "@/lib/api/tenders";
import { getFilterOptions, getCategoryDepartmentCombos } from "@/lib/api/meta";
import { getPygPerUsd } from "@/lib/money";
import { dict } from "@/lib/i18n";
import { serialize } from "@/lib/urlParams";
import { categorySlug, findDepartmentBySlug } from "@/lib/seo";
import { SeoLandingPage, type RelatedLink } from "@/components/SeoLandingPage";

// See src/app/licitaciones/categoria/[slug]/page.tsx for why this is
// force-dynamic rather than ISR.
export const dynamic = "force-dynamic";

async function loadDepartment(slug: string) {
  const options = await getFilterOptions();
  return findDepartmentBySlug(options.departments, slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const department = await loadDepartment(slug);
  if (!department) return { title: "Departamento no encontrado" };
  const title = `Licitaciones públicas en ${department} — DNCP`;
  const description = `Explorá licitaciones públicas en ${department}, Paraguay: estado, montos, comprador y fecha de cierre. Datos abiertos de la DNCP, gratis y sin registro.`;
  return {
    title,
    description,
    alternates: { canonical: `/licitaciones/departamento/${slug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function DepartmentLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const department = await loadDepartment(slug);
  if (!department) notFound();

  const [result, usdRate, combos] = await Promise.all([
    searchTenders({
      currency: "PYG",
      sort: "deadline",
      limit: 20,
      department: [department],
    } as Parameters<typeof searchTenders>[0]),
    getPygPerUsd(),
    getCategoryDepartmentCombos(),
  ]);

  const t = dict();
  const related: RelatedLink[] = combos
    .filter((c) => c.department === department)
    .slice(0, 12)
    .map((c) => ({
      label: c.categoryName ?? c.categoryCode,
      href: `/licitaciones/categoria/${categorySlug(c.categoryCode, c.categoryName)}/${slug}`,
      count: c.count,
    }));

  const queryString = serialize({ department });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Licitaciones públicas en ${department}`,
    description: `Licitaciones públicas en ${department}, Paraguay, publicadas por la DNCP.`,
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/licitaciones/departamento/${slug}`,
    isPartOf: { "@type": "WebSite", name: "ParaOU" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: "/" },
        { "@type": "ListItem", position: 2, name: "Licitaciones", item: "/licitaciones" },
        {
          "@type": "ListItem",
          position: 3,
          name: department,
          item: `/licitaciones/departamento/${slug}`,
        },
      ],
    },
  };

  return (
    <SeoLandingPage
      h1={`${t.seoLanding.breadcrumbTenders} en ${department}`}
      intro={`Todas las licitaciones públicas en ${department}, Paraguay — ${t.seoLanding.introSource}`}
      result={result}
      usdRate={usdRate}
      queryString={queryString}
      relatedTitle={related.length > 0 ? t.seoLanding.relatedCategories : undefined}
      related={related}
      fullFilterHref={`/licitaciones${queryString}`}
      jsonLd={jsonLd}
    />
  );
}
