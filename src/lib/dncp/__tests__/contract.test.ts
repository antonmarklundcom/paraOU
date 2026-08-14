import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { recordPackageSchema, type OcdsRecord, type OcdsRelease } from "../ocds.js";
import { planificacionPackageSchema, type PlanificacionItem } from "../planning.js";
import { mapRecord } from "../map.js";
import { mapPlanificacion } from "../mapPlanning.js";

/**
 * Fixture-shape contract tests.
 *
 * PHASE-1's synthetic fixtures in `__fixtures__/` were modelled from the OCDS 1.1
 * schema and DNCP's documented usage, not captured from the live V3 API (see
 * `__fixtures__/README.md`). Once real record/planificacion packages are captured,
 * they can diverge from what `map.ts`/`mapPlanning.ts` silently assume — a
 * mismatch that currently would only surface as scattered failures deep inside
 * `map.test.ts`/`mapPlanning.test.ts` or, worse, as `null`s in production rows.
 *
 * This suite instead asserts, directly against whichever fixture directory is
 * pointed at, every shape assumption our code makes — each failure names the
 * exact JSON path and what was expected, so swapping in a live capture yields a
 * readable divergence list rather than a stack trace.
 *
 * To point this suite at a live capture, set DNCP_CONTRACT_FIXTURES_DIR, e.g.:
 *   DNCP_CONTRACT_FIXTURES_DIR=src/lib/dncp/__fixtures__/live npx vitest run contract.test.ts
 * This is the ONE place the fixture directory is chosen — nothing else in this
 * file hardcodes a path.
 */
const FIXTURES_DIR = process.env.DNCP_CONTRACT_FIXTURES_DIR
  ? path.resolve(process.env.DNCP_CONTRACT_FIXTURES_DIR)
  : fileURLToPath(new URL("../__fixtures__", import.meta.url));

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), "utf8"));
}

function filesMatching(pattern: RegExp): string[] {
  let entries: string[];
  try {
    entries = readdirSync(FIXTURES_DIR, { withFileTypes: true })
      .filter((e) => e.isFile() && pattern.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    throw new Error(
      `contract.test.ts: could not read fixture directory ${FIXTURES_DIR} (from ` +
        `DNCP_CONTRACT_FIXTURES_DIR or the default __fixtures__/): ${(err as Error).message}`,
    );
  }
  return entries;
}

// ── generic "every field the mappers read" walker ───────────────────────────

interface FieldMatch {
  jsonPath: string;
  value: unknown;
}

/**
 * Resolve a dotted field path against `root`, expanding `foo[]` segments over
 * every element of an array. Missing intermediate objects simply yield no
 * matches for that branch (presence is asserted separately, per-field, since
 * most OCDS/PAC fields are legitimately optional).
 */
function valuesAt(root: unknown, dottedPath: string): FieldMatch[] {
  const segments = dottedPath.split(".");
  let current: FieldMatch[] = [{ jsonPath: "$", value: root }];
  for (const seg of segments) {
    const isArray = seg.endsWith("[]");
    const key = isArray ? seg.slice(0, -2) : seg;
    const next: FieldMatch[] = [];
    for (const { jsonPath, value } of current) {
      if (value === null || value === undefined || typeof value !== "object") continue;
      const child = (value as Record<string, unknown>)[key];
      const childPath = `${jsonPath}.${key}`;
      if (isArray) {
        if (Array.isArray(child)) {
          child.forEach((item, i) => next.push({ jsonPath: `${childPath}[${i}]`, value: item }));
        }
        // child missing or not an array: no matches under this branch — fine,
        // arrays like `items`/`awards`/`documents` are themselves optional.
      } else {
        next.push({ jsonPath: childPath, value: child });
      }
    }
    current = next;
  }
  return current;
}

type TypeCheck = (v: unknown) => boolean;

const isString: TypeCheck = (v) => typeof v === "string";
const isNumber: TypeCheck = (v) => typeof v === "number" && Number.isFinite(v);
const isStringOrNumber: TypeCheck = (v) => isString(v) || isNumber(v);

/**
 * Assert every present (non-null/undefined) value at `fieldPath` under `root`
 * satisfies `check`. Absent values are NOT failures here — presence is a
 * per-record OCDS/PAC reality (docs/06 risk T5), and every mapper field this
 * suite lists is read via optional chaining precisely because of that. What
 * we're guarding is: "when DNCP does send this field, is it the type our
 * mapper assumes?"
 */
function assertFieldType(
  root: unknown,
  rootLabel: string,
  fieldPath: string,
  check: TypeCheck,
  typeDescription: string,
): void {
  for (const { jsonPath, value } of valuesAt(root, fieldPath)) {
    if (value === null || value === undefined) continue;
    if (!check(value)) {
      throw new Error(
        `${rootLabel} ${jsonPath}: expected ${typeDescription}, got ${typeof value} ` +
          `(${JSON.stringify(value)})`,
      );
    }
  }
}

// ── field inventories, derived by reading map.ts / mapPlanning.ts / *Source.ts ──

/**
 * Fields `mapRelease`/`mapRecord`/`mapAward` (map.ts) read off a compiled
 * release, plus `recordDate` (worker/source.ts) reading `compiledRelease.date`.
 * Paths are relative to the release object (`record.compiledRelease`, or the
 * fallback release `mapRecord` picks when no compiledRelease is published).
 */
const RELEASE_FIELDS: Array<[string, TypeCheck, string]> = [
  ["ocid", isString, "string"],
  ["date", isString, "ISO date string"],
  ["tender.id", isString, "string"],
  ["tender.title", isString, "string"],
  ["tender.description", isString, "string"],
  ["tender.status", isString, "string"],
  ["tender.procurementMethod", isString, "string"],
  ["tender.procurementMethodDetails", isString, "string"],
  ["tender.mainProcurementCategory", isString, "string"],
  ["tender.value.amount", isNumber, "number"],
  ["tender.value.currency", isString, "string"],
  ["tender.minValue.amount", isNumber, "number"],
  ["tender.minValue.currency", isString, "string"],
  ["tender.tenderPeriod.startDate", isString, "ISO date string"],
  ["tender.tenderPeriod.endDate", isString, "ISO date string"],
  ["tender.enquiryPeriod.endDate", isString, "ISO date string"],
  ["tender.procuringEntity.id", isString, "string"],
  ["tender.procuringEntity.name", isString, "string"],
  ["tender.items[].id", isString, "string"],
  ["tender.items[].classification.id", isString, "string"],
  ["tender.items[].classification.description", isString, "string"],
  ["tender.documents[].url", isString, "string"],
  ["buyer.id", isString, "string"],
  ["buyer.name", isString, "string"],
  ["parties[].id", isString, "string"],
  ["parties[].name", isString, "string"],
  ["parties[].identifier.id", isString, "string"],
  ["parties[].address.region", isString, "string"],
  ["parties[].address.locality", isString, "string"],
  ["awards[].id", isString, "string"],
  ["awards[].status", isString, "string"],
  ["awards[].date", isString, "ISO date string"],
  ["awards[].value.amount", isNumber, "number"],
  ["awards[].value.currency", isString, "string"],
  ["awards[].suppliers[].id", isString, "string"],
  ["awards[].suppliers[].name", isString, "string"],
  // mapStatus only reads contracts.length — id isn't consumed, but a contracts
  // entry that isn't an object at all would still break `.length` semantics
  // elsewhere, so keep the array-of-objects assumption documented here.
  ["contracts[].id", isString, "string"],
];

/**
 * Fields `mapPlanificacion` (mapPlanning.ts) reads off a `planificaciones[]`
 * entry, plus `itemDate` (worker/planningSource.ts) reading `fechaPublicacion`.
 */
const PLANNING_FIELDS: Array<[string, TypeCheck, string]> = [
  ["id", isStringOrNumber, "string or number"],
  ["ocid", isString, "string"],
  ["anio", isStringOrNumber, "string or number"],
  ["nombre", isString, "string"],
  ["titulo", isString, "string"],
  ["descripcion", isString, "string"],
  ["entidad.id", isStringOrNumber, "string or number"],
  ["entidad.ruc", isString, "string"],
  ["entidad.nombre", isString, "string"],
  ["entidad.region", isString, "string"],
  ["entidad.departamento", isString, "string"],
  ["categoria.id", isString, "string"],
  ["categoria.description", isString, "string"],
  ["clasificacion.id", isString, "string"],
  ["clasificacion.description", isString, "string"],
  ["montoEstimado.amount", isNumber, "number"],
  ["montoEstimado.currency", isString, "string"],
  ["tipoProcedimiento", isString, "string"],
  ["modalidad", isString, "string"],
  ["trimestreEstimado", isStringOrNumber, "string or number"],
  ["fechaEstimada", isString, "ISO date string"],
  ["fechaPublicacion", isString, "ISO date string"],
  ["estado", isString, "string"],
];

/**
 * `source.ts`/`planningSource.ts` read `pagination.total_pages` with a
 * `?? page` fallback, so its absence never breaks pagination — but if DNCP
 * sends it, our loop trusts it to be a number. Field names themselves are
 * unconfirmed against the live V3 Swagger (ocds.ts/planning.ts top-of-file
 * warning) — this only pins down the type once the field is present.
 */
const PAGINATION_FIELDS: Array<[string, TypeCheck, string]> = [
  ["pagination.page", isNumber, "number"],
  ["pagination.total_pages", isNumber, "number"],
  ["pagination.next", isString, "string"],
];

const VALID_TENDER_STATUSES = new Set([
  "PLANNED",
  "OPEN",
  "CLOSED",
  "AWARDED",
  "CONTRACTED",
  "CANCELLED",
  "UNSUCCESSFUL",
]);

function resolveCompiledRelease(record: OcdsRecord): OcdsRelease | undefined {
  return (
    record.compiledRelease ??
    [...(record.releases ?? [])].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")).at(-1)
  );
}

function formatZodError(file: string, schemaName: string, error: { issues: Array<{ path: (string | number)[]; message: string }> }): string {
  const issues = error.issues.map((i) => `  - $.${i.path.join(".")}: ${i.message}`).join("\n");
  return `${file} failed ${schemaName} validation:\n${issues}`;
}

// ── record packages (ocds.ts / map.ts) ───────────────────────────────────────

describe(`DNCP record package contract (fixtures: ${path.relative(process.cwd(), FIXTURES_DIR)})`, () => {
  const files = filesMatching(/^record-package.*\.json$/i);

  it("finds at least one record package fixture to check", () => {
    expect(files.length, `no record-package*.json files found in ${FIXTURES_DIR}`).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const raw = readJson(file);
      const parsed = recordPackageSchema.safeParse(raw);

      it("validates against recordPackageSchema", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "recordPackageSchema", parsed.error));
        }
      });

      it("every field map.ts reads off a compiled release is present with the expected type", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "recordPackageSchema", parsed.error));
        }
        const pkg = parsed.data;
        for (const record of pkg.records) {
          const release = resolveCompiledRelease(record);
          if (!release) continue; // no compiled/derivable release — mapRecord itself skips this record
          const label = `${file} record ${record.ocid}`;
          for (const [fieldPath, check, desc] of RELEASE_FIELDS) {
            assertFieldType(release, label, fieldPath, check, desc);
          }
        }
      });

      it("pagination fields, when present, have the expected type", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "recordPackageSchema", parsed.error));
        }
        for (const [fieldPath, check, desc] of PAGINATION_FIELDS) {
          assertFieldType(parsed.data, file, fieldPath, check, desc);
        }
      });

      it("mapping every record yields the Prisma Tender-required non-null fields", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "recordPackageSchema", parsed.error));
        }
        for (const record of parsed.data.records) {
          const mapped = mapRecord(record);
          const label = `${file} record ${record.ocid}`;
          if (resolveCompiledRelease(record) === undefined) {
            // mapRecord correctly returns null when there is nothing to compile from.
            expect(mapped, `${label}: expected null (no compiled/derivable release)`).toBeNull();
            continue;
          }
          expect(mapped, `${label}: mapRecord returned null unexpectedly`).not.toBeNull();
          if (!mapped) continue;
          expect(typeof mapped.ocid, `${label}.ocid must be a non-empty string`).toBe("string");
          expect(mapped.ocid.length, `${label}.ocid must be a non-empty string`).toBeGreaterThan(0);
          expect(typeof mapped.title, `${label}.title must be a non-empty string`).toBe("string");
          expect(mapped.title.length, `${label}.title must be a non-empty string`).toBeGreaterThan(0);
          expect(
            VALID_TENDER_STATUSES.has(mapped.status),
            `${label}.status "${mapped.status}" is not a member of the Prisma TenderStatus enum`,
          ).toBe(true);
          expect(typeof mapped.currency, `${label}.currency must be a non-empty string`).toBe("string");
          expect(mapped.currency.length, `${label}.currency must be a non-empty string`).toBeGreaterThan(
            0,
          );
          expect(mapped.raw, `${label}.raw must be preserved`).not.toBeNull();
          expect(mapped.raw, `${label}.raw must be preserved`).not.toBeUndefined();
        }
      });
    });
  }
});

// ── planificaciones packages (planning.ts / mapPlanning.ts) ──────────────────

describe(`DNCP planificaciones package contract (fixtures: ${path.relative(process.cwd(), FIXTURES_DIR)})`, () => {
  const files = filesMatching(/^planificaciones.*\.json$/i);

  it("finds at least one planificaciones package fixture to check", () => {
    expect(
      files.length,
      `no planificaciones*.json files found in ${FIXTURES_DIR}`,
    ).toBeGreaterThan(0);
  });

  for (const file of files) {
    describe(file, () => {
      const raw = readJson(file);
      const parsed = planificacionPackageSchema.safeParse(raw);

      it("validates against planificacionPackageSchema", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "planificacionPackageSchema", parsed.error));
        }
      });

      it("every field mapPlanning.ts reads off a PAC entry is present with the expected type", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "planificacionPackageSchema", parsed.error));
        }
        for (const item of parsed.data.planificaciones) {
          const label = `${file} planificacion ${item.id}`;
          for (const [fieldPath, check, desc] of PLANNING_FIELDS) {
            assertFieldType(item, label, fieldPath, check, desc);
          }
        }
      });

      it("pagination fields, when present, have the expected type", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "planificacionPackageSchema", parsed.error));
        }
        for (const [fieldPath, check, desc] of PAGINATION_FIELDS) {
          assertFieldType(parsed.data, file, fieldPath, check, desc);
        }
      });

      it("mapping every entry yields the Prisma PlannedPurchase-required non-null fields", () => {
        if (!parsed.success) {
          throw new Error(formatZodError(file, "planificacionPackageSchema", parsed.error));
        }
        for (const item of parsed.data.planificaciones satisfies PlanificacionItem[]) {
          const mapped = mapPlanificacion(item);
          const label = `${file} planificacion ${item.id}`;
          expect(typeof mapped.externalId, `${label}.externalId must be a non-empty string`).toBe(
            "string",
          );
          expect(
            mapped.externalId.length,
            `${label}.externalId must be a non-empty string`,
          ).toBeGreaterThan(0);
          expect(typeof mapped.title, `${label}.title must be a non-empty string`).toBe("string");
          expect(mapped.title.length, `${label}.title must be a non-empty string`).toBeGreaterThan(0);
          expect(typeof mapped.currency, `${label}.currency must be a non-empty string`).toBe("string");
          expect(
            mapped.currency.length,
            `${label}.currency must be a non-empty string`,
          ).toBeGreaterThan(0);
          expect(mapped.raw, `${label}.raw must be preserved`).not.toBeNull();
          expect(mapped.raw, `${label}.raw must be preserved`).not.toBeUndefined();
        }
      });
    });
  }
});
