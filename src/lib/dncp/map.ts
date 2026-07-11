import type { OcdsAward, OcdsParty, OcdsRecord, OcdsRelease } from "./ocds.js";

/**
 * OCDS → normalized ParaOU rows.
 *
 * Pure functions, no DB/network — this is the unit under test (PHASE-1 acceptance:
 * "OCDS mapping (fixtures → rows)"). The full OCDS JSON is preserved separately in
 * `Tender.raw`; everything here is a recomputable projection (CLAUDE.md rule 4).
 */

/** Mirrors the Prisma `TenderStatus` enum. Keep the two in sync. */
export type TenderStatus =
  "PLANNED" | "OPEN" | "CLOSED" | "AWARDED" | "CONTRACTED" | "CANCELLED" | "UNSUCCESSFUL";

export interface MappedBuyer {
  id: string;
  name: string;
  ruc: string | null;
  level: string | null;
}

export interface MappedSupplier {
  id: string;
  name: string;
  ruc: string | null;
}

export interface MappedAward {
  id: string;
  amount: string | null;
  currency: string | null;
  date: Date | null;
  status: string | null;
  supplier: MappedSupplier | null;
}

export interface MappedTender {
  ocid: string;
  dncpId: string | null;
  title: string;
  description: string | null;
  status: TenderStatus;
  categoryCode: string | null;
  categoryName: string | null;
  procurementMethod: string | null;
  amountMin: string | null;
  amountMax: string | null;
  currency: string;
  department: string | null;
  buyerName: string | null;
  publishedAt: Date | null;
  deadlineAt: Date | null;
  inquiryDeadlineAt: Date | null;
  documentsUrl: string | null;
  sourceUrl: string | null;
  buyer: MappedBuyer | null;
  awards: MappedAward[];
  raw: unknown;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** OCDS amounts are JSON numbers; PYG values are huge, so carry them as strings for Decimal. */
function parseDecimal(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return value;
  }
  return null;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/**
 * Map an OCDS tender.status (+ presence of awards/contracts) to our lifecycle enum.
 * OCDS statuses: planning | planned | active | cancelled | unsuccessful | complete | withdrawn.
 */
export function mapStatus(release: OcdsRelease): TenderStatus {
  const hasContracts = (release.contracts?.length ?? 0) > 0;
  const hasActiveAward = (release.awards ?? []).some(
    (a) => (a.status ?? "active").toLowerCase() === "active",
  );
  const raw = (release.tender?.status ?? "").toLowerCase();

  switch (raw) {
    case "planning":
    case "planned":
      return "PLANNED";
    case "active":
      return "OPEN";
    case "cancelled":
    case "withdrawn":
      return "CANCELLED";
    case "unsuccessful":
      return "UNSUCCESSFUL";
    case "complete":
      if (hasContracts) return "CONTRACTED";
      if (hasActiveAward) return "AWARDED";
      return "CLOSED";
    default:
      // No/unknown tender status: infer from lifecycle progression.
      if (hasContracts) return "CONTRACTED";
      if (hasActiveAward) return "AWARDED";
      return "OPEN";
  }
}

function findParty(parties: OcdsParty[] | null | undefined, id: string | null | undefined) {
  if (!id) return undefined;
  return (parties ?? []).find((p) => p.id === id);
}

function partyRuc(party: OcdsParty | undefined): string | null {
  return firstNonEmpty(party?.identifier?.id);
}

function partyRegion(party: OcdsParty | undefined): string | null {
  return firstNonEmpty(party?.address?.region, party?.address?.locality);
}

function mapAward(award: OcdsAward, parties: OcdsParty[] | null | undefined): MappedAward | null {
  const id = firstNonEmpty(award.id);
  if (!id) return null;
  const supplierRef = award.suppliers?.[0];
  let supplier: MappedSupplier | null = null;
  const supplierId = firstNonEmpty(supplierRef?.id);
  if (supplierId) {
    const party = findParty(parties, supplierId);
    supplier = {
      id: supplierId,
      name: firstNonEmpty(supplierRef?.name, party?.name) ?? supplierId,
      ruc: partyRuc(party),
    };
  }
  return {
    id,
    amount: parseDecimal(award.value?.amount),
    currency: firstNonEmpty(award.value?.currency),
    date: parseDate(award.date),
    status: firstNonEmpty(award.status),
    supplier,
  };
}

/**
 * Map a single compiled OCDS release to the normalized Tender projection.
 * `raw` should be the full record/release JSON that gets stored verbatim.
 */
export function mapRelease(release: OcdsRelease, raw: unknown = release): MappedTender {
  const tender = release.tender ?? {};
  const parties = release.parties;

  const buyerRef = release.buyer ?? tender.procuringEntity;
  const buyerParty = findParty(parties, buyerRef?.id);
  let buyer: MappedBuyer | null = null;
  const buyerId = firstNonEmpty(buyerRef?.id, buyerParty?.id);
  if (buyerId) {
    buyer = {
      id: buyerId,
      name: firstNonEmpty(buyerRef?.name, buyerParty?.name) ?? buyerId,
      ruc: partyRuc(buyerParty),
      level: null,
    };
  }

  const firstItemClass = tender.items?.find((i) => i.classification)?.classification;

  const value = tender.value;
  const minValue = tender.minValue;

  return {
    ocid: release.ocid,
    dncpId: firstNonEmpty(tender.id),
    title: firstNonEmpty(tender.title, tender.id, release.ocid) ?? release.ocid,
    description: firstNonEmpty(tender.description),
    status: mapStatus(release),
    categoryCode: firstNonEmpty(firstItemClass?.id),
    categoryName: firstNonEmpty(firstItemClass?.description, tender.mainProcurementCategory),
    procurementMethod: firstNonEmpty(tender.procurementMethodDetails, tender.procurementMethod),
    amountMin: parseDecimal(minValue?.amount ?? value?.amount),
    amountMax: parseDecimal(value?.amount),
    currency: firstNonEmpty(value?.currency, minValue?.currency) ?? "PYG",
    department: partyRegion(buyerParty),
    buyerName: buyer?.name ?? null,
    publishedAt: parseDate(release.date) ?? parseDate(tender.tenderPeriod?.startDate),
    deadlineAt: parseDate(tender.tenderPeriod?.endDate),
    inquiryDeadlineAt: parseDate(tender.enquiryPeriod?.endDate),
    documentsUrl: firstNonEmpty(tender.documents?.find((d) => d.url)?.url),
    sourceUrl: null,
    buyer,
    awards: (release.awards ?? [])
      .map((a) => mapAward(a, parties))
      .filter((a): a is MappedAward => a !== null),
    raw,
  };
}

/**
 * Map an OCDS record (from a record package). Prefers `compiledRelease`; falls back
 * to the latest dated release if the publisher did not compile one.
 */
export function mapRecord(record: OcdsRecord): MappedTender | null {
  const compiled =
    record.compiledRelease ??
    [...(record.releases ?? [])].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).at(-1);
  if (!compiled) return null;
  // Ensure the ocid is carried even if only present on the record wrapper.
  const release: OcdsRelease = { ...compiled, ocid: compiled.ocid ?? record.ocid };
  return mapRelease(release, record.compiledRelease ?? record);
}
