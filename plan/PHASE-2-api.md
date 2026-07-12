# Phase 2 — Internal API: search, filter, sort

**Goal:** a fast, typed query layer over the tender data that the frontend (Phase 3)
consumes. Next.js route handlers under `/api/*` (no separate server).
**Read first:** docs/03-data-model.md, docs/05-ux-ui.md (filter list drives the API).

## Endpoints

1. `GET /api/tenders` — the workhorse. Query params (zod-validated, all optional):
   - `q` (Spanish FTS via `websearch_to_tsquery('spanish', ...)`, accent-insensitive
     — add `unaccent` extension),
   - `status[]`, `category[]` (N5 code prefixes), `buyer`, `department[]`,
   - `amountMin`, `amountMax`, `currency` (convert USD input using daily rate),
   - `method[]`, `publishedFrom/To`, `deadlineWithinDays`,
   - `sort` = `newest | deadline | amount | relevance` (relevance = FTS rank),
   - cursor pagination (`cursor`, `limit` ≤ 50).
   - Returns list items shaped exactly for the row card (docs/05) + `totalEstimate`.
2. `GET /api/tenders/[ocid]` — full detail incl. awards, buyer history teaser,
   timeline events.
3. `GET /api/buyers/[id]`, `GET /api/suppliers/[id]` — profile + aggregates
   (open tenders, historical awards by category/year; SQL group-bys, cached 1h).
4. `GET /api/meta/filters` — filter option lists with counts (categories present,
   departments, methods, buyers typeahead via `GET /api/buyers?query=`). Cached.
5. `GET /api/health` (from Phase 1) extended with row counts.

## Requirements

- All handlers: zod input validation, consistent error envelope, no N+1 (use
  Prisma `include`/raw SQL where aggregates need it).
- Performance target: `GET /api/tenders` p95 < 300 ms on 1M rows — verify indexes
  with `EXPLAIN ANALYZE`; add composite indexes as needed.
- Rate limit public endpoints (simple in-memory/IP, e.g. 60 req/min) to protect the
  free tier from scraping.
- Integration tests with a seeded test DB (docker) covering each filter and sort.

## Acceptance criteria

- Every filter in docs/05 §1 is expressible and tested.
- Cursor pagination is stable under concurrent inserts.
- `q=insumos medicos` (no accents) finds "insumos médicos".
- CI green.
