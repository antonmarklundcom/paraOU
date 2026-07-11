import { z } from "zod";

/**
 * OCDS 1.1 typed interfaces — only the fields ParaOU maps, plus passthrough of the
 * rest (docs/01, CLAUDE.md rule 4: never lose raw data). Everything is defensively
 * optional because government data is inconsistent (docs/06 risk T5).
 *
 * Reference: https://standard.open-contracting.org/1.1/en/schema/release/
 *
 * ⚠️ These shapes were modelled from the OCDS 1.1 schema and DNCP's known usage.
 * The exact DNCP V3 payloads MUST be confirmed against the live Swagger doc and the
 * saved fixtures once the API is reachable (PHASE-1 step 2 / docs/06 risk T1).
 */

const money = z
  .object({
    amount: z.number().nullish(),
    currency: z.string().nullish(),
  })
  .passthrough();

const period = z
  .object({
    startDate: z.string().nullish(),
    endDate: z.string().nullish(),
  })
  .passthrough();

const classification = z
  .object({
    scheme: z.string().nullish(),
    id: z.string().nullish(),
    description: z.string().nullish(),
  })
  .passthrough();

const item = z
  .object({
    id: z.string().nullish(),
    classification: classification.nullish(),
  })
  .passthrough();

const document = z
  .object({
    id: z.string().nullish(),
    documentType: z.string().nullish(),
    url: z.string().nullish(),
  })
  .passthrough();

const organizationReference = z
  .object({
    id: z.string().nullish(),
    name: z.string().nullish(),
  })
  .passthrough();

export const partySchema = z
  .object({
    id: z.string().nullish(),
    name: z.string().nullish(),
    roles: z.array(z.string()).nullish(),
    identifier: z
      .object({
        scheme: z.string().nullish(),
        id: z.string().nullish(),
        legalName: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    address: z
      .object({
        region: z.string().nullish(),
        locality: z.string().nullish(),
        countryName: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    details: z
      .object({
        classifications: z
          .array(z.object({ description: z.string().nullish() }).passthrough())
          .nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const tenderSchema = z
  .object({
    id: z.string().nullish(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    status: z.string().nullish(),
    procurementMethod: z.string().nullish(),
    procurementMethodDetails: z.string().nullish(),
    mainProcurementCategory: z.string().nullish(),
    value: money.nullish(),
    minValue: money.nullish(),
    tenderPeriod: period.nullish(),
    enquiryPeriod: period.nullish(),
    procuringEntity: organizationReference.nullish(),
    items: z.array(item).nullish(),
    documents: z.array(document).nullish(),
  })
  .passthrough();

export const awardSchema = z
  .object({
    id: z.string().nullish(),
    title: z.string().nullish(),
    status: z.string().nullish(),
    date: z.string().nullish(),
    value: money.nullish(),
    suppliers: z.array(organizationReference).nullish(),
  })
  .passthrough();

export const contractSchema = z
  .object({
    id: z.string().nullish(),
    status: z.string().nullish(),
    dateSigned: z.string().nullish(),
    value: money.nullish(),
  })
  .passthrough();

export const releaseSchema = z
  .object({
    ocid: z.string(),
    id: z.string().nullish(),
    date: z.string().nullish(),
    tag: z.array(z.string()).nullish(),
    initiationType: z.string().nullish(),
    language: z.string().nullish(),
    tender: tenderSchema.nullish(),
    buyer: organizationReference.nullish(),
    parties: z.array(partySchema).nullish(),
    awards: z.array(awardSchema).nullish(),
    contracts: z.array(contractSchema).nullish(),
    planning: z.record(z.unknown()).nullish(),
  })
  .passthrough();

export const recordSchema = z
  .object({
    ocid: z.string(),
    releases: z.array(releaseSchema).nullish(),
    compiledRelease: releaseSchema.nullish(),
  })
  .passthrough();

export const recordPackageSchema = z
  .object({
    uri: z.string().nullish(),
    version: z.string().nullish(),
    publishedDate: z.string().nullish(),
    records: z.array(recordSchema),
    // DNCP paginates its list/search responses; the exact field names are verified
    // against the live spec (PHASE-1 step 2). Kept passthrough + optional here.
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

export const releasePackageSchema = z
  .object({
    uri: z.string().nullish(),
    version: z.string().nullish(),
    publishedDate: z.string().nullish(),
    releases: z.array(releaseSchema),
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

export type Money = z.infer<typeof money>;
export type OcdsParty = z.infer<typeof partySchema>;
export type OcdsTender = z.infer<typeof tenderSchema>;
export type OcdsAward = z.infer<typeof awardSchema>;
export type OcdsContract = z.infer<typeof contractSchema>;
export type OcdsRelease = z.infer<typeof releaseSchema>;
export type OcdsRecord = z.infer<typeof recordSchema>;
export type OcdsRecordPackage = z.infer<typeof recordPackageSchema>;
export type OcdsReleasePackage = z.infer<typeof releasePackageSchema>;
