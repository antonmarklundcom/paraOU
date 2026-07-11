import type { MetadataRoute } from "next";
import { prisma } from "@/lib/db";

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
  ];

  try {
    const tenders = await prisma.tender.findMany({
      select: { ocid: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
      take: 5000,
    });
    return [
      ...staticEntries,
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
