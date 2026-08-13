import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";
import { getFilterOptions, getCategoryDepartmentCombos } from "@/lib/api/meta";
import { categorySlug, departmentSlug } from "@/lib/seo";

// Generate per-request so newly ingested tenders appear without a rebuild.
export const dynamic = "force-dynamic";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Sitemap (docs/05 SEO). Single file capped at 5k URLs for now; when the corpus
 * grows past that, switch to Next's `generateSitemaps` to chunk by id. Wrapped in
 * try/catch so a DB hiccup degrades to the static routes rather than failing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: APP_URL, changeFrequency: "daily", priority: 1 },
    { url: `${APP_URL}/licitaciones`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${APP_URL}/observatorio`, changeFrequency: "daily", priority: 0.8 },
  ];

  try {
    const [tenders, options, combos] = await Promise.all([
      prisma.tender.findMany({
        select: { ocid: true, updatedAt: true },
        orderBy: { publishedAt: "desc" },
        take: 4000,
      }),
      getFilterOptions(),
      getCategoryDepartmentCombos(),
    ]);

    // SEO landing pages (PLAN.md Phase G) — category, department, and combo pages
    // built from the same taxonomy `generateStaticParams` uses for those routes.
    const categoryEntries: MetadataRoute.Sitemap = options.categories.map((c) => ({
      url: `${APP_URL}/licitaciones/categoria/${categorySlug(c.code, c.name)}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
    const departmentEntries: MetadataRoute.Sitemap = options.departments.map((d) => ({
      url: `${APP_URL}/licitaciones/departamento/${departmentSlug(d.value)}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
    const comboEntries: MetadataRoute.Sitemap = combos.map((c) => ({
      url: `${APP_URL}/licitaciones/categoria/${categorySlug(c.categoryCode, c.categoryName)}/${departmentSlug(c.department)}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    }));

    return [
      ...staticEntries,
      ...categoryEntries,
      ...departmentEntries,
      ...comboEntries,
      ...tenders.map((t) => ({
        url: `${APP_URL}/licitaciones/${encodeURIComponent(t.ocid)}`,
        lastModified: t.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.6,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
