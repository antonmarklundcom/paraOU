import type { PlanificacionItem } from "./planning.js";

/**
 * PAC entry → normalized `PlannedPurchase` projection. Pure function, no DB/network
 * — mirrors `map.ts`'s mapRelease/mapRecord pattern for tenders (PHASE-1). The full
 * PAC JSON is preserved separately in `PlannedPurchase.raw` (CLAUDE.md rule 4).
 */

export interface MappedPlannedPurchase {
  externalId: string;
  ocid: string | null;
  year: number | null;
  title: string;
  description: string | null;
  status: string | null;
  categoryCode: string | null;
  categoryName: string | null;
  procurementMethod: string | null;
  estimatedAmount: string | null;
  currency: string;
  department: string | null;
  buyerId: string | null;
  buyerName: string | null;
  buyerRuc: string | null;
  estimatedQuarter: string | null;
  estimatedDate: Date | null;
  publishedAt: Date | null;
  raw: unknown;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDecimal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return value;
  }
  return null;
}

function firstNonEmpty(...values: Array<string | number | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

function parseYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && /^\d{4}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/** Map one DNCP PAC entry to the normalized PlannedPurchase projection. */
export function mapPlanificacion(item: PlanificacionItem, raw: unknown = item): MappedPlannedPurchase {
  const externalId = String(item.id);
  const category = item.categoria ?? item.clasificacion;
  const buyerRuc = firstNonEmpty(item.entidad?.ruc);
  const buyerName = firstNonEmpty(item.entidad?.nombre);
  // Prefer DNCP's own party id (matches the OCDS Buyer.id shape used elsewhere);
  // fall back to a RUC-derived synthetic id so the FK is still stable when the PAC
  // entry only carries a tax id and no OCDS-style identifier.
  const buyerId = firstNonEmpty(item.entidad?.id) ?? (buyerRuc ? `PY-RUC-${buyerRuc}` : null);

  return {
    externalId,
    ocid: firstNonEmpty(item.ocid),
    year: parseYear(item.anio),
    title: firstNonEmpty(item.nombre, item.titulo, `PAC ${externalId}`) ?? `PAC ${externalId}`,
    description: firstNonEmpty(item.descripcion),
    status: firstNonEmpty(item.estado),
    categoryCode: firstNonEmpty(category?.id),
    categoryName: firstNonEmpty(category?.description),
    procurementMethod: firstNonEmpty(item.tipoProcedimiento, item.modalidad),
    estimatedAmount: parseDecimal(item.montoEstimado?.amount),
    currency: firstNonEmpty(item.montoEstimado?.currency) ?? "PYG",
    department: firstNonEmpty(item.entidad?.departamento, item.entidad?.region),
    buyerId,
    buyerName,
    buyerRuc,
    estimatedQuarter: firstNonEmpty(item.trimestreEstimado),
    estimatedDate: parseDate(item.fechaEstimada),
    publishedAt: parseDate(item.fechaPublicacion),
    raw,
  };
}

/** Map a whole PAC package's entries; never throws on a single malformed entry —
 * DNCP data is inconsistent (docs/06 risk T5), so one bad row is skipped, not fatal. */
export function mapPlanificaciones(items: PlanificacionItem[]): MappedPlannedPurchase[] {
  const out: MappedPlannedPurchase[] = [];
  for (const item of items) {
    try {
      out.push(mapPlanificacion(item));
    } catch {
      // skip malformed entry
    }
  }
  return out;
}
