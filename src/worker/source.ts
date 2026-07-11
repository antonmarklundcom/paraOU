import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { recordPackageSchema, type OcdsRecord } from "../lib/dncp/ocds.js";
import type { DncpClient } from "../lib/dncp/client.js";

/**
 * A record source yields OCDS records to ingest. Two implementations:
 *  - `LiveSource` pulls from the DNCP API via the shared client.
 *  - `FixtureSource` reads the synthetic packages in `src/lib/dncp/__fixtures__/`
 *    (used when DNCP secrets are absent — fixtures mode, PHASE-1 step 2).
 */
export interface RecordSource {
  readonly mode: "live" | "fixtures";
  /** Records published/modified strictly after `since` (null = all). */
  recordsSince(since: Date | null): Promise<OcdsRecord[]>;
}

const FIXTURE_FILES = ["record-package.json"];

export async function loadFixtureRecords(files: string[] = FIXTURE_FILES): Promise<OcdsRecord[]> {
  const records: OcdsRecord[] = [];
  for (const file of files) {
    const url = new URL(`../lib/dncp/__fixtures__/${file}`, import.meta.url);
    const json = JSON.parse(await readFile(fileURLToPath(url), "utf8"));
    const pkg = recordPackageSchema.parse(json);
    records.push(...pkg.records);
  }
  return records;
}

function recordDate(record: OcdsRecord): Date | null {
  const iso = record.compiledRelease?.date;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class FixtureSource implements RecordSource {
  readonly mode = "fixtures" as const;
  constructor(private readonly files: string[] = FIXTURE_FILES) {}

  async recordsSince(since: Date | null): Promise<OcdsRecord[]> {
    const all = await loadFixtureRecords(this.files);
    if (!since) return all;
    return all.filter((r) => {
      const d = recordDate(r);
      return d ? d > since : true;
    });
  }
}

export class LiveSource implements RecordSource {
  readonly mode = "live" as const;
  constructor(
    private readonly client: DncpClient,
    private readonly maxPages = 20,
  ) {}

  async recordsSince(since: Date | null): Promise<OcdsRecord[]> {
    // NOTE: the search → record-package flow below follows OCDS + DNCP V2 conventions
    // and MUST be validated against the live V3 spec (PHASE-1 step 2 / docs/06 T1).
    const dateFrom = since ? since.toISOString().slice(0, 10) : undefined;
    const ocids = new Set<string>();
    for (let page = 1; page <= this.maxPages; page++) {
      const pkg = await this.client.searchReleases({ dateFrom, page });
      for (const rel of pkg.releases) ocids.add(rel.ocid);
      const totalPages = pkg.pagination?.total_pages ?? page;
      if (page >= totalPages) break;
    }

    const records: OcdsRecord[] = [];
    for (const ocid of ocids) {
      const pkg = await this.client.getRecordPackage(ocid);
      records.push(...pkg.records);
    }
    return records;
  }
}
