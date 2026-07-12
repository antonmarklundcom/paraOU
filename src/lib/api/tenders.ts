import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { toPyg } from "../money.js";
import { ApiError } from "./http.js";
import { decodeCursor, encodeCursor } from "./pagination.js";

/**
 * GET /api/tenders query layer (PHASE-2). Implemented with parameterized raw SQL
 * (Prisma.sql) so we can drive the generated `searchVector` FTS column, ts_rank
 * relevance, and keyset pagination — none of which Prisma's query builder can
 * express. Every dynamic value is a bound parameter; only fixed, whitelisted tokens
 * (sort direction/cast/operator) use Prisma.raw.
 */

const STATUSES = [
  "PLANNED",
  "OPEN",
  "CLOSED",
  "AWARDED",
  "CONTRACTED",
  "CANCELLED",
  "UNSUCCESSFUL",
] as const;

/** Normalize a query param that may arrive as a single string or an array. */
const arrayOf = <T extends z.ZodTypeAny>(item: T) =>
  z
    .preprocess((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]), z.array(item))
    .optional();

export const tenderQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  status: arrayOf(z.enum(STATUSES)),
  category: arrayOf(z.string().min(1).max(40)),
  buyer: z.string().min(1).max(120).optional(),
  department: arrayOf(z.string().min(1).max(80)),
  method: arrayOf(z.string().min(1).max(120)),
  amountMin: z.coerce.number().nonnegative().optional(),
  amountMax: z.coerce.number().nonnegative().optional(),
  currency: z.enum(["PYG", "USD"]).default("PYG"),
  publishedFrom: z.coerce.date().optional(),
  publishedTo: z.coerce.date().optional(),
  deadlineWithinDays: z.coerce.number().int().positive().max(365).optional(),
  sort: z.enum(["newest", "deadline", "amount", "relevance"]).default("newest"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type TenderQuery = z.infer<typeof tenderQuerySchema>;

export interface TenderListItem {
  ocid: string;
  title: string;
  status: string;
  buyerName: string | null;
  department: string | null;
  procurementMethod: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  currency: string;
  amountMin: string | null;
  amountMax: string | null;
  publishedAt: string | null;
  deadlineAt: string | null;
  daysUntilDeadline: number | null;
  documentsUrl: string | null;
  matchRank?: number;
}

export interface TenderListResult {
  items: TenderListItem[];
  nextCursor: string | null;
  totalEstimate: number;
  totalCapped: boolean;
}

type SortKey = "newest" | "deadline" | "amount" | "relevance";

interface SortConfig {
  expr: Prisma.Sql;
  dir: "ASC" | "DESC";
  cast: string;
  cmp: "<" | ">";
}

function ftsQuery(q: string): Prisma.Sql {
  return Prisma.sql`websearch_to_tsquery('spanish_unaccent', ${q})`;
}

function sortConfig(sort: SortKey, q: string | undefined): SortConfig {
  // Relevance requires a text query; without one, fall back to newest.
  if (sort === "relevance" && q) {
    return {
      expr: Prisma.sql`ts_rank("searchVector", ${ftsQuery(q)})`,
      dir: "DESC",
      cast: "double precision",
      cmp: "<",
    };
  }
  if (sort === "deadline") {
    return {
      expr: Prisma.sql`COALESCE("deadlineAt", 'infinity'::timestamp)`,
      dir: "ASC",
      cast: "timestamp",
      cmp: ">",
    };
  }
  if (sort === "amount") {
    return {
      expr: Prisma.sql`COALESCE("amountMax", '-Infinity'::numeric)`,
      dir: "DESC",
      cast: "numeric",
      cmp: "<",
    };
  }
  return {
    expr: Prisma.sql`COALESCE("publishedAt", '-infinity'::timestamp)`,
    dir: "DESC",
    cast: "timestamp",
    cmp: "<",
  };
}

async function buildFilters(params: TenderQuery): Promise<Prisma.Sql[]> {
  const conds: Prisma.Sql[] = [];
  if (params.q) conds.push(Prisma.sql`"searchVector" @@ ${ftsQuery(params.q)}`);
  if (params.status?.length) {
    conds.push(Prisma.sql`"status"::text IN (${Prisma.join(params.status)})`);
  }
  if (params.category?.length) {
    const likes = params.category.map((p) => Prisma.sql`"categoryCode" LIKE ${p + "%"}`);
    conds.push(Prisma.sql`(${Prisma.join(likes, " OR ")})`);
  }
  if (params.buyer) conds.push(Prisma.sql`"buyerId" = ${params.buyer}`);
  if (params.department?.length) {
    conds.push(Prisma.sql`"department" IN (${Prisma.join(params.department)})`);
  }
  if (params.method?.length) {
    conds.push(Prisma.sql`"procurementMethod" IN (${Prisma.join(params.method)})`);
  }
  if (params.amountMin !== undefined) {
    const min = await toPyg(params.amountMin, params.currency);
    conds.push(Prisma.sql`"amountMax" >= ${min}`);
  }
  if (params.amountMax !== undefined) {
    const max = await toPyg(params.amountMax, params.currency);
    conds.push(Prisma.sql`"amountMax" <= ${max}`);
  }
  if (params.publishedFrom) conds.push(Prisma.sql`"publishedAt" >= ${params.publishedFrom}`);
  if (params.publishedTo) conds.push(Prisma.sql`"publishedAt" <= ${params.publishedTo}`);
  if (params.deadlineWithinDays !== undefined) {
    conds.push(
      Prisma.sql`"deadlineAt" >= now() AND "deadlineAt" <= now() + make_interval(days => ${params.deadlineWithinDays}::int)`,
    );
  }
  return conds;
}

function whereClause(conds: Prisma.Sql[]): Prisma.Sql {
  return conds.length ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}` : Prisma.empty;
}

interface RawRow {
  ocid: string;
  title: string;
  status: string;
  buyerName: string | null;
  department: string | null;
  procurementMethod: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  currency: string;
  amountMin: string | null;
  amountMax: string | null;
  publishedAt: Date | null;
  deadlineAt: Date | null;
  documentsUrl: string | null;
  sortVal: string;
  matchRank?: number;
}

function daysUntil(deadline: Date | null): number | null {
  if (!deadline) return null;
  const ms = deadline.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function toItem(row: RawRow, withRank: boolean): TenderListItem {
  return {
    ocid: row.ocid,
    title: row.title,
    status: row.status,
    buyerName: row.buyerName,
    department: row.department,
    procurementMethod: row.procurementMethod,
    categoryCode: row.categoryCode,
    categoryName: row.categoryName,
    currency: row.currency,
    amountMin: row.amountMin,
    amountMax: row.amountMax,
    publishedAt: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    deadlineAt: row.deadlineAt ? new Date(row.deadlineAt).toISOString() : null,
    daysUntilDeadline: daysUntil(row.deadlineAt ? new Date(row.deadlineAt) : null),
    documentsUrl: row.documentsUrl,
    ...(withRank && row.matchRank !== undefined ? { matchRank: Number(row.matchRank) } : {}),
  };
}

export async function searchTenders(params: TenderQuery): Promise<TenderListResult> {
  const cfg = sortConfig(params.sort, params.q);
  const filters = await buildFilters(params);

  // Count (filters only) — capped so we never full-scan a huge table.
  const countRows = await prisma.$queryRaw<{ c: number }[]>(Prisma.sql`
    SELECT count(*)::int AS c
    FROM (SELECT 1 FROM "Tender" ${whereClause(filters)} LIMIT 10001) t
  `);
  const rawCount = countRows[0]?.c ?? 0;
  const totalCapped = rawCount > 10000;

  // List (filters + keyset seek).
  const listConds = [...filters];
  if (params.cursor) {
    const cursor = decodeCursor(params.cursor);
    const castVal = Prisma.sql`${cursor.v}${Prisma.raw("::" + cfg.cast)}`;
    listConds.push(
      Prisma.sql`(${cfg.expr}, "ocid") ${Prisma.raw(cfg.cmp)} (${castVal}, ${cursor.id})`,
    );
  }

  const withRank = params.sort === "relevance" && Boolean(params.q);
  const rankSelect = withRank
    ? Prisma.sql`, ts_rank("searchVector", ${ftsQuery(params.q!)})::double precision AS "matchRank"`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT "ocid", "title", "status"::text AS status, "buyerName", "department",
           "procurementMethod", "categoryCode", "categoryName", "currency",
           "amountMin"::text AS "amountMin", "amountMax"::text AS "amountMax",
           "publishedAt", "deadlineAt", "documentsUrl",
           (${cfg.expr})::text AS "sortVal"${rankSelect}
    FROM "Tender"
    ${whereClause(listConds)}
    ORDER BY ${cfg.expr} ${Prisma.raw(cfg.dir)}, "ocid" ${Prisma.raw(cfg.dir)}
    LIMIT ${params.limit + 1}
  `);

  const hasMore = rows.length > params.limit;
  const page = rows.slice(0, params.limit);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor({ v: last.sortVal, id: last.ocid }) : null;

  return {
    items: page.map((r) => toItem(r, withRank)),
    nextCursor,
    totalEstimate: totalCapped ? 10000 : rawCount,
    totalCapped,
  };
}

// ── Detail ────────────────────────────────────────────────────────────────────

export async function getTenderDetail(ocid: string) {
  const tender = await prisma.tender.findUnique({
    where: { ocid },
    include: {
      buyer: true,
      awards: { include: { supplier: true }, orderBy: { date: "desc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!tender) throw new ApiError(404, "NOT_FOUND", `Tender ${ocid} not found`);

  // Buyer history teaser: recent awards by the same buyer in the same category.
  let buyerHistory: Array<{
    ocid: string;
    title: string;
    supplier: string | null;
    amount: string | null;
    date: string | null;
  }> = [];
  if (tender.buyerId) {
    const rows = await prisma.$queryRaw<
      {
        ocid: string;
        title: string;
        supplier: string | null;
        amount: string | null;
        date: Date | null;
      }[]
    >(Prisma.sql`
      SELECT t."ocid", t."title", s."name" AS supplier, a."amount"::text AS amount, a."date"
      FROM "Award" a
      JOIN "Tender" t ON a."tenderId" = t."id"
      LEFT JOIN "Supplier" s ON a."supplierId" = s."id"
      WHERE t."buyerId" = ${tender.buyerId}
        AND t."ocid" <> ${ocid}
        ${tender.categoryCode ? Prisma.sql`AND t."categoryCode" = ${tender.categoryCode}` : Prisma.empty}
      ORDER BY a."date" DESC NULLS LAST
      LIMIT 5
    `);
    buyerHistory = rows.map((r) => ({
      ocid: r.ocid,
      title: r.title,
      supplier: r.supplier,
      amount: r.amount,
      date: r.date ? new Date(r.date).toISOString() : null,
    }));
  }

  return {
    id: tender.id,
    ocid: tender.ocid,
    dncpId: tender.dncpId,
    title: tender.title,
    description: tender.description,
    status: tender.status,
    procurementMethod: tender.procurementMethod,
    categoryCode: tender.categoryCode,
    categoryName: tender.categoryName,
    currency: tender.currency,
    amountMin: tender.amountMin?.toString() ?? null,
    amountMax: tender.amountMax?.toString() ?? null,
    department: tender.department,
    publishedAt: tender.publishedAt?.toISOString() ?? null,
    deadlineAt: tender.deadlineAt?.toISOString() ?? null,
    inquiryDeadlineAt: tender.inquiryDeadlineAt?.toISOString() ?? null,
    daysUntilDeadline: daysUntil(tender.deadlineAt),
    documentsUrl: tender.documentsUrl,
    sourceUrl: tender.sourceUrl,
    aiSummary: tender.aiSummary,
    buyer: tender.buyer
      ? {
          id: tender.buyer.id,
          name: tender.buyer.name,
          ruc: tender.buyer.ruc,
          level: tender.buyer.level,
        }
      : null,
    awards: tender.awards.map((a) => ({
      id: a.id,
      amount: a.amount?.toString() ?? null,
      currency: a.currency,
      date: a.date?.toISOString() ?? null,
      status: a.status,
      supplier: a.supplier
        ? { id: a.supplier.id, name: a.supplier.name, ruc: a.supplier.ruc }
        : null,
    })),
    timeline: tender.events.map((e) => ({
      type: e.type,
      field: e.field,
      oldValue: e.oldValue,
      newValue: e.newValue,
      at: e.createdAt.toISOString(),
    })),
    buyerHistory,
  };
}
