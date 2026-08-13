import { z } from "zod";

/**
 * `planificaciones` (Plan Anual de Contrataciones / PAC) — DNCP's bespoke endpoint
 * group, distinct from the OCDS `ocds/*` endpoints (docs/01 table). A PAC entry is
 * an agency's *intent* to buy something later this year — it is published long
 * before any `convocatoria`/OCDS release exists, often with no `ocid` at all yet
 * (docs/07 #1: "PAC early-warning").
 *
 * ⚠️ Modelled defensively (all optional + passthrough) from the DNCP open-data
 * portal's documented PAC fields — same caveat as ocds.ts: MUST be confirmed
 * against the live V3 Swagger (docs/01, docs/06 risk T1/T4) before this is trusted
 * to be field-complete. Unknown/renamed fields are preserved anyway via `raw`
 * (CLAUDE.md rule 4), so a shape mismatch only degrades the normalized columns,
 * never loses data.
 */

const money = z
  .object({
    amount: z.number().nullish(),
    currency: z.string().nullish(),
  })
  .passthrough();

const classification = z
  .object({
    scheme: z.string().nullish(),
    id: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();

const entidad = z
  .object({
    id: z.union([z.string(), z.number()]).nullish(),
    ruc: z.string().nullish(),
    nombre: z.string().nullish(),
    region: z.string().nullish(),
    departamento: z.string().nullish(),
  })
  .passthrough();

export const planificacionItemSchema = z
  .object({
    // DNCP's internal PAC entry id — the natural external key (there may be no
    // OCDS ocid yet, since no tender has been convened).
    id: z.union([z.string(), z.number()]),
    // If the agency later links this PAC line to a convocatoria, DNCP may echo the
    // resulting ocid here — used to de-duplicate once the real tender appears.
    ocid: z.string().nullish(),
    anio: z.union([z.string(), z.number()]).nullish(), // PAC year (e.g. 2026)
    nombre: z.string().nullish(),
    titulo: z.string().nullish(),
    descripcion: z.string().nullish(),
    entidad: entidad.nullish(),
    clasificacion: classification.nullish(),
    categoria: classification.nullish(),
    montoEstimado: money.nullish(),
    tipoProcedimiento: z.string().nullish(),
    modalidad: z.string().nullish(),
    trimestreEstimado: z.union([z.string(), z.number()]).nullish(),
    fechaEstimada: z.string().nullish(),
    fechaPublicacion: z.string().nullish(),
    estado: z.string().nullish(),
  })
  .passthrough();

export const planificacionPackageSchema = z
  .object({
    uri: z.string().nullish(),
    version: z.string().nullish(),
    publishedDate: z.string().nullish(),
    planificaciones: z.array(planificacionItemSchema),
    pagination: z
      .object({
        page: z.number().nullish(),
        total_pages: z.number().nullish(),
        next: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export type PlanificacionItem = z.infer<typeof planificacionItemSchema>;
export type PlanificacionPackage = z.infer<typeof planificacionPackageSchema>;
