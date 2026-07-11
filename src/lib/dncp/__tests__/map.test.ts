import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { recordPackageSchema } from "../ocds.js";
import { mapRecord, mapStatus, type MappedTender } from "../map.js";

function loadPackage(file: string) {
  const url = new URL(`../__fixtures__/${file}`, import.meta.url);
  return recordPackageSchema.parse(JSON.parse(readFileSync(fileURLToPath(url), "utf8")));
}

function byOcid(records: MappedTender[], ocid: string): MappedTender {
  const found = records.find((r) => r.ocid === ocid);
  if (!found) throw new Error(`missing ${ocid}`);
  return found;
}

describe("mapRecord (fixtures → rows)", () => {
  const pkg = loadPackage("record-package.json");
  const mapped = pkg.records.map((r) => mapRecord(r)).filter((m): m is MappedTender => m !== null);

  it("maps all three fixture records", () => {
    expect(mapped).toHaveLength(3);
  });

  it("maps an OPEN goods tender with amounts, category, buyer and dates", () => {
    const t = byOcid(mapped, "ocds-03ad3f-390111");
    expect(t.status).toBe("OPEN");
    expect(t.dncpId).toBe("390111");
    expect(t.title).toContain("Insumos Médicos");
    expect(t.amountMin).toBe("4000000000");
    expect(t.amountMax).toBe("4500000000");
    expect(t.currency).toBe("PYG");
    expect(t.categoryCode).toBe("42142523");
    expect(t.categoryName).toBe("Jeringas hipodérmicas");
    expect(t.procurementMethod).toBe("Licitación Pública Nacional");
    expect(t.buyer?.id).toBe("PY-RUC-80016909");
    expect(t.buyer?.ruc).toBe("80016909-2");
    expect(t.buyerName).toContain("Ministerio de Salud");
    expect(t.department).toBe("Central");
    expect(t.deadlineAt?.toISOString()).toBe("2024-04-05T11:00:00.000Z");
    expect(t.inquiryDeadlineAt?.toISOString()).toBe("2024-03-25T11:00:00.000Z");
    expect(t.publishedAt?.toISOString()).toBe("2024-03-10T14:30:00.000Z");
    expect(t.documentsUrl).toContain("pliego.pdf");
    expect(t.awards).toHaveLength(0);
  });

  it("maps an awarded works tender with a supplier", () => {
    const t = byOcid(mapped, "ocds-03ad3f-388502");
    expect(t.status).toBe("AWARDED");
    expect(t.department).toBe("Alto Paraná");
    expect(t.awards).toHaveLength(1);
    const award = t.awards[0]!;
    expect(award.amount).toBe("2750000000");
    expect(award.status).toBe("active");
    expect(award.supplier?.id).toBe("PY-RUC-80099887");
    expect(award.supplier?.name).toContain("Constructora del Este");
    expect(award.supplier?.ruc).toBe("80099887-3");
  });

  it("maps a PLANNED tender and falls back to value for amountMin", () => {
    const t = byOcid(mapped, "ocds-03ad3f-391777");
    expect(t.status).toBe("PLANNED");
    expect(t.amountMin).toBe("950000000");
    expect(t.amountMax).toBe("950000000");
    expect(t.categoryCode).toBe("44121700");
  });

  it("always preserves the raw OCDS JSON", () => {
    for (const t of mapped) {
      expect(t.raw).toBeTypeOf("object");
    }
  });
});

describe("mapStatus", () => {
  const base = { ocid: "x" } as const;
  it("maps OCDS tender statuses to the lifecycle enum", () => {
    expect(mapStatus({ ...base, tender: { status: "planning" } })).toBe("PLANNED");
    expect(mapStatus({ ...base, tender: { status: "active" } })).toBe("OPEN");
    expect(mapStatus({ ...base, tender: { status: "cancelled" } })).toBe("CANCELLED");
    expect(mapStatus({ ...base, tender: { status: "unsuccessful" } })).toBe("UNSUCCESSFUL");
    expect(mapStatus({ ...base, tender: { status: "complete" } })).toBe("CLOSED");
  });

  it("prefers contract/award lifecycle over a bare complete status", () => {
    expect(
      mapStatus({
        ...base,
        tender: { status: "complete" },
        awards: [{ id: "a", status: "active" }],
      }),
    ).toBe("AWARDED");
    expect(
      mapStatus({
        ...base,
        tender: { status: "complete" },
        awards: [{ id: "a", status: "active" }],
        contracts: [{ id: "c" }],
      }),
    ).toBe("CONTRACTED");
  });
});
