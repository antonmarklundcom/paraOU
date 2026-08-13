import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { planificacionPackageSchema, type PlanificacionItem } from "../lib/dncp/planning.js";
import type { DncpClient } from "../lib/dncp/client.js";

/**
 * A planning source yields PAC (`planificaciones`) entries to ingest — the F3
 * "PAC early-warning" analogue of `source.ts`'s `RecordSource` for tenders. Two
 * implementations, same split:
 *  - `LivePlanningSource` pulls from the DNCP API via the shared DncpClient.
 *  - `FixturePlanningSource` reads the synthetic package in
 *    `src/lib/dncp/__fixtures__/` (used when DNCP secrets are absent).
 */
export interface PlanningSource {
  readonly mode: "live" | "fixtures";
  /** PAC entries published/modified strictly after `since` (null = all). */
  itemsSince(since: Date | null): Promise<PlanificacionItem[]>;
}

const FIXTURE_FILE = "planificaciones-package.json";

export async function loadFixturePlanificaciones(
  file: string = FIXTURE_FILE,
): Promise<PlanificacionItem[]> {
  const url = new URL(`../lib/dncp/__fixtures__/${file}`, import.meta.url);
  const json = JSON.parse(await readFile(fileURLToPath(url), "utf8"));
  const pkg = planificacionPackageSchema.parse(json);
  return pkg.planificaciones;
}

function itemDate(item: PlanificacionItem): Date | null {
  const iso = item.fechaPublicacion;
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export class FixturePlanningSource implements PlanningSource {
  readonly mode = "fixtures" as const;
  constructor(private readonly file: string = FIXTURE_FILE) {}

  async itemsSince(since: Date | null): Promise<PlanificacionItem[]> {
    const all = await loadFixturePlanificaciones(this.file);
    if (!since) return all;
    return all.filter((item) => {
      const d = itemDate(item);
      return d ? d > since : true;
    });
  }
}

export class LivePlanningSource implements PlanningSource {
  readonly mode = "live" as const;
  constructor(
    private readonly client: DncpClient,
    private readonly maxPages = 20,
  ) {}

  async itemsSince(since: Date | null): Promise<PlanificacionItem[]> {
    const dateFrom = since ? since.toISOString().slice(0, 10) : undefined;
    const items: PlanificacionItem[] = [];
    for (let page = 1; page <= this.maxPages; page++) {
      const pkg = await this.client.searchPlanificaciones({ dateFrom, page });
      items.push(...pkg.planificaciones);
      const totalPages = pkg.pagination?.total_pages ?? page;
      if (page >= totalPages) break;
    }
    return items;
  }
}
