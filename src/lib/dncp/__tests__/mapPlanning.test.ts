import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planificacionPackageSchema } from "../planning.js";
import { mapPlanificacion, mapPlanificaciones, type MappedPlannedPurchase } from "../mapPlanning.js";

function loadPackage(file: string) {
  const url = new URL(`../__fixtures__/${file}`, import.meta.url);
  return planificacionPackageSchema.parse(JSON.parse(readFileSync(fileURLToPath(url), "utf8")));
}

function byExternalId(items: MappedPlannedPurchase[], id: string): MappedPlannedPurchase {
  const found = items.find((r) => r.externalId === id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

describe("mapPlanificaciones (fixtures → rows)", () => {
  const pkg = loadPackage("planificaciones-package.json");
  const mapped = mapPlanificaciones(pkg.planificaciones);

  it("maps all three fixture PAC entries", () => {
    expect(mapped).toHaveLength(3);
  });

  it("maps a PAC entry with buyer, category, amount and estimated quarter", () => {
    const p = byExternalId(mapped, "PAC-2026-000451");
    expect(p.title).toContain("Ambulancias");
    expect(p.year).toBe(2026);
    expect(p.categoryCode).toBe("25101507");
    expect(p.categoryName).toBe("Ambulancias");
    expect(p.estimatedAmount).toBe("12000000000");
    expect(p.currency).toBe("PYG");
    expect(p.procurementMethod).toBe("Licitación Pública Nacional");
    expect(p.buyerId).toBe("PY-RUC-80016909");
    expect(p.buyerRuc).toBe("80016909-2");
    expect(p.buyerName).toContain("Ministerio de Salud");
    expect(p.department).toBe("Central");
    expect(p.estimatedQuarter).toBe("2026-Q4");
    expect(p.estimatedDate?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(p.publishedAt?.toISOString()).toBe("2026-01-10T09:00:00.000Z");
    expect(p.status).toBe("PROGRAMADO");
    expect(p.ocid).toBeNull(); // no tender/convocatoria exists yet
  });

  it("maps the remaining entries with distinct buyers/categories", () => {
    const road = byExternalId(mapped, "PAC-2026-000452");
    expect(road.department).toBe("Alto Paraná");
    expect(road.categoryCode).toBe("72141115");

    const school = byExternalId(mapped, "PAC-2026-000453");
    expect(school.status).toBe("CONVOCADO");
    expect(school.estimatedQuarter).toBe("2026-Q1");
  });

  it("always preserves the raw PAC JSON", () => {
    for (const p of mapped) {
      expect(p.raw).toBeTypeOf("object");
    }
  });

  it("falls back to a synthetic title when nombre/titulo are absent", () => {
    const m = mapPlanificacion({ id: "PAC-X" });
    expect(m.title).toBe("PAC PAC-X");
    expect(m.buyerId).toBeNull();
  });

  it("derives a RUC-based buyer id when only a tax id is present (no OCDS-style id)", () => {
    const m = mapPlanificacion({
      id: "PAC-Y",
      entidad: { ruc: "12345678-9", nombre: "Municipalidad X" },
    });
    expect(m.buyerId).toBe("PY-RUC-12345678-9");
    expect(m.buyerName).toBe("Municipalidad X");
  });
});
