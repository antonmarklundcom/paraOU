# DNCP OCDS fixtures

These JSON files are **synthetic** OCDS 1.1 record packages that mirror the shape of
Paraguay's DNCP publication (ocid prefix `ocds-03ad3f`, Spanish text, PYG amounts).
They drive the mapping unit tests and the ingestion integration test, and they are
used as the data source when the app runs in **fixtures mode** (no DNCP secrets).

⚠️ They are **placeholders until the live API is verified**. Per PHASE-1 step 2, once
`https://contrataciones.gov.py/datos/api/v3/doc/` is reachable with real credentials,
replace these with 5–10 real record/release responses and save the OpenAPI spec to
`docs/reference/dncp-v3-openapi.json`. The planning/dev environment could not reach
contrataciones.gov.py (network policy — docs/06 risk T4), so these were built from the
OCDS 1.1 schema and DNCP's documented usage.

| File                            | Purpose                                                                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `record-package.json`            | 3 tenders: OPEN (goods), CONTRACTED/awarded (works), PLANNED (goods).                                                                                                                                            |
| `record-package-updated.json`    | A later compiled release of `ocds-03ad3f-390111` (status + deadline + award change) — exercises change-event detection and idempotent updates.                                                                 |
| `planificaciones-package.json`   | 3 synthetic PAC (Plan Anual de Contrataciones) entries from the bespoke `planificaciones` endpoint (docs/01; F3 "PAC early-warning") — no `ocid` yet, only agencies' *intent* to buy. Drives `mapPlanning.ts` unit tests and planning ingestion in fixtures mode. |
