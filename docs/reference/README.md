# API reference specs

Save vendor API contracts here so the coding agent has the exact shapes offline.

## `dncp-v3-openapi.json` — NOT YET SAVED

PHASE-1 step 2 requires exporting the DNCP V3 OpenAPI/Swagger JSON from
`https://contrataciones.gov.py/datos/api/v3/doc/` (there is usually a `main.json`
link) into this folder.

This could not be done in the Phase 1 build environment because the network policy
blocks `contrataciones.gov.py` (docs/06 risk T4 verification log). **Owner action:**
from a browser or the production VPS, download the spec and commit it here. Once
present, reconcile `src/lib/dncp/ocds.ts` (response shapes) and
`src/lib/dncp/client.ts` / `source.ts` (endpoint paths + pagination) against it, and
replace the synthetic fixtures in `src/lib/dncp/__fixtures__/`.
