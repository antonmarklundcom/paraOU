import { z } from "zod";
import { prisma } from "../db.js";

/**
 * GET /api/planificacion query layer (F3, Business-tier "planned purchases"
 * feed — docs/07 #1). Deliberately simpler than `tenders.ts`: PAC volume is far
 * lower than the tender feed, so a plain Prisma `findMany` with offset paging is
 * enough — no FTS/keyset pagination needed yet.
 */

const arrayOf = <T extends z.ZodTypeAny>(item: T) =>
  z
    .preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(item))
    .optional();

export const plannedPurchaseQuerySchema = z.object({
  category: arrayOf(z.string().min(1).max(40)),
  department: arrayOf(z.string().min(1).max(80)),
  year: z.coerce.number().int().optional(),
  sort: z.enum(["newest", "estimatedDate"]).default("newest"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type PlannedPurchaseQuery = z.infer<typeof plannedPurchaseQuerySchema>;

export interface PlannedPurchaseListItem {
  id: string;
  externalId: string;
  ocid: string | null;
  year: number | null;
  title: string;
  description: string | null;
  status: string | null;
  buyerName: string | null;
  department: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  procurementMethod: string | null;
  currency: string;
  estimatedAmount: string | null;
  estimatedQuarter: string | null;
  estimatedDate: string | null;
  publishedAt: string | null;
}

export interface PlannedPurchaseListResult {
  items: PlannedPurchaseListItem[];
  page: number;
  limit: number;
  total: number;
}

export async function searchPlannedPurchases(
  params: PlannedPurchaseQuery,
): Promise<PlannedPurchaseListResult> {
  const where = {
    ...(params.category?.length ? { categoryCode: { in: params.category } } : {}),
    ...(params.department?.length ? { department: { in: params.department } } : {}),
    ...(params.year ? { year: params.year } : {}),
  };

  const orderBy =
    params.sort === "estimatedDate"
      ? [{ estimatedDate: "asc" as const }, { id: "asc" as const }]
      : [{ publishedAt: "desc" as const }, { id: "asc" as const }];

  const [rows, total] = await Promise.all([
    prisma.plannedPurchase.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.limit,
      take: params.limit,
    }),
    prisma.plannedPurchase.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      ocid: r.ocid,
      year: r.year,
      title: r.title,
      description: r.description,
      status: r.status,
      buyerName: r.buyerName,
      department: r.department,
      categoryCode: r.categoryCode,
      categoryName: r.categoryName,
      procurementMethod: r.procurementMethod,
      currency: r.currency,
      estimatedAmount: r.estimatedAmount?.toString() ?? null,
      estimatedQuarter: r.estimatedQuarter,
      estimatedDate: r.estimatedDate?.toISOString() ?? null,
      publishedAt: r.publishedAt?.toISOString() ?? null,
    })),
    page: params.page,
    limit: params.limit,
    total,
  };
}
