/**
 * ⚠️ UNVERIFIED AGAINST LIVE V3: every path, query-param name, and pagination
 * field below is modelled from OCDS + DNCP V2 docs, not the live V3 Swagger
 * (PHASE-1 step 2 / docs/06 risk T1). Reconciling with the real spec should
 * mean editing this object only — see scripts/capture-dncp.ts for the script
 * that will capture and diff live responses against these assumptions.
 */
export const ENDPOINTS = {
  searchReleases: {
    path: "ocds/releases",
    query: {
      dateFrom: "fecha_desde",
      dateTo: "fecha_hasta",
      page: "page",
    },
    nextPageField: "pagination.next",
  },
  getRecordPackage: {
    path: (ocid: string) => `ocds/record/${encodeURIComponent(ocid)}`,
  },
  searchPlanificaciones: {
    path: "planificaciones",
    query: {
      dateFrom: "fecha_desde",
      dateTo: "fecha_hasta",
      anio: "anio",
      page: "page",
    },
    nextPageField: "pagination.next",
  },
} as const;
