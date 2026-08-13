import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { searchTenders } from "@/lib/api/tenders";
import { getFilterOptions, getCategoryDepartmentCombos } from "@/lib/api/meta";
import { getPygPerUsd } from "@/lib/money";
import { dict } from "@/lib/i18n";
import { serialize } from "@/lib/urlParams";
import { departmentSlug, findCategoryBySlug } from "@/lib/seo";
import { SeoLandingPage } from "@/components/SeoLandingPage";

// Combo pages (e.g. "Licitaciones de construcción en Alto Paraná") — the example
// from PLAN.md Phase G. Only served for category × department pairs that actually
// have tenders (getCategoryDepartmentCombos), so there's no thin content. See
// src/app/licitaciones/categoria/[slug]/page.tsx for why this is force-dynamic
// rather than ISR.
export const dynamic = "force-dynamic";

async function loadCombo(slug: string, deptSlug: string) {
  const [options, combos] = await Promise.all([getFilterOptions(), getCategoryDepartmentCombos()]);
  const category = findCategoryBySlug(options.categories, slug);
  if (!category) return null;
  const department = options.departments.find((d) => departmentSlug(d.value) === deptSlug)?.value;
  if (!department) return null;
  const exists = combos.some(
    (c) => c.categoryCode === category.code && c.department === department,
  );
  if (!exists) return null;
  return { category, department };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; deptSlug: string }>;
}): Promise<Metadata> {
  const { slug, deptSlug } = await params;
  const combo = await loadCombo(slug, deptSlug);
  if (!combo) return { title: "Licitaciones no encontradas" };
  const name = combo.category.name ?? combo.category.code;
  const title = `Licitaciones de ${name} en ${combo.department} — DNCP`;
  const description = `Licitaciones públicas de ${name} en ${combo.department}, Paraguay: estado, montos, comprador y fecha de cierre. Datos abiertos de la DNCP, gratis y sin registro.`;
  return {
    title,
    description,
    alternates: { canonical: `/licitaciones/categoria/${slug}/${deptSlug}` },
    openGraph: { title, description, type: "website" },
  };
}

export default async function CategoryDepartmentLandingPage({
  params,
}: {
  params: Promise<{ slug: string; deptSlug: string }>;
}) {
  const { slug, deptSlug } = await params;
  const combo = await loadCombo(slug, deptSlug);
  if (!combo) notFound();
  const name = combo.category.name ?? combo.category.code;

  const [result, usdRate] = await Promise.all([
    searchTenders({
      currency: "PYG",
      sort: "deadline",
      limit: 20,
      category: [combo.category.code],
      department: [combo.department],
    } as Parameters<typeof searchTenders>[0]),
    getPygPerUsd(),
  ]);

  const t = dict();
  const queryString = serialize({ category: combo.category.code, department: combo.department });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Licitaciones de ${name} en ${combo.department}`,
    description: `Licitaciones públicas de ${name} en ${combo.department}, Paraguay, publicadas por la DNCP.`,
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/licitaciones/categoria/${slug}/${deptSlug}`,
    isPartOf: { "@type": "WebSite", name: "ParaOU" },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: "/" },
        { "@type": "ListItem", position: 2, name: "Licitaciones", item: "/licitaciones" },
        {
          "@type": "ListItem",
          position: 3,
          name,
          item: `/licitaciones/categoria/${slug}`,
        },
        {
          "@type": "ListItem",
          position: 4,
          name: combo.department,
          item: `/licitaciones/categoria/${slug}/${deptSlug}`,
        },
      ],
    },
  };

  return (
    <SeoLandingPage
      h1={`${t.seoLanding.breadcrumbTenders} de ${name} en ${combo.department}`}
      intro={`Todas las licitaciones públicas de ${name} en ${combo.department}, Paraguay — ${t.seoLanding.introSource}`}
      result={result}
      usdRate={usdRate}
      queryString={queryString}
      fullFilterHref={`/licitaciones${queryString}`}
      jsonLd={jsonLd}
    />
  );
}
