# DNCP API — Research & Integration Guide

Source of truth: https://contrataciones.gov.py/datos/api/v3/doc/ (Swagger UI).
**Use API V3.** V1 and V2 are deprecated (shut down April/June 2023) — the docs the
owner found for V1/V2 describe the same auth model, but all endpoints must be taken
from V3. Ignore V1 entirely.

> ⚠️ **Verify before coding.** This document was written from the official V2 docs
> (same auth model as V3), the DNCP open-data portal description, and the OCDS
> ecosystem (Kingfisher Collect has a production scraper for this exact API). The
> planning environment could not reach contrataciones.gov.py directly (network
> policy), so the very first task of Phase 1 is to hit the live Swagger doc
> (`/datos/api/v3/doc/`) with real credentials and confirm endpoint paths, response
> shapes, and pagination before building the client.

## Is it free? — YES

- Registration on the **Portal de Datos Abiertos de la DNCP** is free:
  https://www.contrataciones.gov.py/datos/adm/login
- You create an **application** in the portal → it generates `consumer key`,
  `consumer secret`, and a **request token**.
- **Rate limit: 5,000 requests per 15 minutes** per application — generous. An
  unauthenticated/test mode allows only ~4 req/s and is not for production.
- The data is open data (DNCP publishes under open-data principles / OCDS; check the
  portal's terms for attribution requirements — typically CC-BY-style attribution
  "Fuente: DNCP").

## Authentication flow (OAuth-ish, token exchange)

1. `POST /oauth/token` with header `Authorization: Basic [request_token]`
   → returns an `access_token`.
2. **Access token lives 15 minutes.** After expiry, request a new one.
3. All data calls: header `Authorization: Bearer [access_token]`.
4. Optional `POST /oauth/invalidate_token` to kill a token early.

Client implementation requirements:
- Auto-refresh: on 401 (or proactively at ~13 min), fetch a new access token.
- Global rate limiter: token-bucket, stay well under 5,000/15 min (e.g. cap at
  4 req/s sustained, 3,000/15 min budget) — if the limit is hit, DNCP blocks until
  the current access token expires.
- Exponential backoff on 429/5xx.

## Endpoint groups (V3 mirrors V2's structure)

| Group | What it is | Our use |
|---|---|---|
| `convocatorias` | **Tender notices (the "jobs")** — open calls for bids | Core. This is the feed. |
| `planificaciones` | Procurement plans (PACs) — what agencies *intend* to buy this year | Premium feature: early signals before the tender exists |
| `adjudicaciones` | Awards — who won, amounts | Competitor intelligence |
| `contratos` | Signed contracts | Intelligence + market sizing |
| `modificaciones-contrato` | Contract amendments | Nice-to-have analytics |
| `buscadores` | Search services | Useful for incremental sync (search by date range) |
| `parametros`, `catalogos` | Reference data: entities, categories, geo, catalog codes | Needed for filters. Paraguay uses the **Catálogo de Bienes y Servicios (N5, UNSPSC-based)** — this is our category taxonomy |
| `proveedores` | Supplier registry | Enrich competitor profiles |
| `ocds` | **Open Contracting Data Standard releases/records** | **Preferred ingestion format** — standardized JSON, one schema for the whole lifecycle |

## Recommended ingestion strategy

**Ingest via the OCDS endpoints** (`releases`/`record` packages) rather than the
bespoke endpoints, because:
1. OCDS is a stable, documented schema (https://standard.open-contracting.org) —
   `tender`, `awards`, `contracts`, `parties`, `planning` in one record keyed by
   `ocid` (DNCP prefix: `ocds-03ad3f`).
2. It makes the codebase reusable for other OCDS countries later.
3. OCP's Kingfisher Collect scrapes DNCP this way in production — the pattern is
   proven (search endpoint filtered by date, then fetch record packages).

Fall back to the bespoke `convocatorias`/`buscadores` endpoints only if the OCDS
endpoints turn out to lag or miss fields (verify in Phase 1 — the OCDS section was
historically marked BETA).

**Bulk backfill:** DNCP/OCP also publish **bulk downloads** (annual OCDS record
packages / CSVs) via the portal's "data" section and the OCP Data Registry
(https://data.open-contracting.org — Paraguay DNCP is publication #63). For the
initial historical load (~15 years), prefer bulk files over hammering the API; use
the API for incremental daily/hourly sync only.

Sync cadence: every 30–60 min poll for tenders published/modified since last sync
(buscadores by `fecha_desde`/publication date). Full-day reconciliation nightly.

## What you must do yourself

These require a human with a browser/inbox — the coding agent cannot do them:

1. **Register on the DNCP portal** (https://www.contrataciones.gov.py/datos/adm/login),
   create an application, and save the `consumer key`, `consumer secret`, and
   `request token` into `.env` (never commit them). Registration may want personal
   details; it's free.
2. While in the Swagger UI, **export/save the V3 spec** (there is usually a
   `main.json` / swagger JSON link) into `docs/reference/` in this repo so the coding
   agent has the exact contract offline.
3. **Skim the terms of use** on the portal for attribution requirements and any
   resale restrictions (open-data portals almost always allow commercial reuse with
   attribution — confirm and note it in this file).
4. **Anthropic API key** for the AI matching (console.anthropic.com) + a **Voyage AI
   key** (or alternative) for embeddings — see docs/04.
5. **Hostinger**: confirm whether your Cloud plan supports a persistent Node.js
   process (see docs/02 — likely you'll want their VPS instead).
6. Optional but smart: download one **bulk OCDS file** manually from the portal to
   eyeball real data early.

## Do we need V1?

**No.** V1 and V2 are both dead (2023). Everything is V3.
