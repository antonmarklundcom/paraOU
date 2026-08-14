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

## Synthetic vs. live, and the contract test

The files above are **synthetic**: hand-built to match the OCDS 1.1 schema and DNCP's
*documented* usage, not captured from the live API. `map.test.ts`/`mapPlanning.test.ts`
assert specific values baked into these synthetic shapes — useful for pinning mapper
behavior, but they only prove the mappers work *on data shaped like this*. A live
capture that diverges (renamed field, different type, missing pagination key, …) would
otherwise only surface as scattered, hard-to-read failures once it's swapped in.

`__tests__/contract.test.ts` guards against that instead: it asserts every shape
assumption `map.ts`/`mapPlanning.ts`/`client.ts` make about DNCP's JSON — zod schema
acceptance, the type of every field the mappers actually read, and that mapping a
record/entry always produces the non-null columns the Prisma models require — against
whichever fixture directory it's pointed at, independent of the specific values in that
directory. Each assertion names the exact JSON path and the expected type, so a
divergence reads as a list, not a stack trace.

**To switch it to a live capture:**

1. Once `https://contrataciones.gov.py/datos/api/v3/doc/` is reachable with real
   credentials (PHASE-1 step 2), capture 5–10 real record/planificaciones package
   responses and save them under `__fixtures__/live/` (same filename conventions:
   `record-package*.json`, `planificaciones*.json`).
2. Run the contract suite against them in one place, without touching the test file:
   ```
   DNCP_CONTRACT_FIXTURES_DIR=src/lib/dncp/__fixtures__/live npx vitest run contract.test.ts
   ```
3. Once the live shapes are confirmed and `docs/reference/dncp-v3-openapi.json` is
   saved, promote `__fixtures__/live/` to replace the synthetic files here (and update
   `map.test.ts`/`mapPlanning.test.ts`'s baked-in expected values to match), rather than
   maintaining two fixture sets long-term.

The default (no env var) always runs against the synthetic files in this directory, so
`npm test` keeps working unchanged until a live capture exists.
