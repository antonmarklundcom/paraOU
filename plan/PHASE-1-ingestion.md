# Phase 1 — DNCP client, database, sync worker

**Goal:** real Paraguayan tender data flowing into Postgres on a schedule.
**Read first:** docs/01-dncp-api.md, docs/02-architecture.md, docs/03-data-model.md.

## Prerequisites (owner-provided, in `.env`)

`DNCP_REQUEST_TOKEN` (and consumer key/secret), `DATABASE_URL`.
If these are missing, build everything against recorded fixtures (see step 2) and
mark the live-verification steps as TODO for the owner.

## Steps

1. **Scaffold**: Next.js 15 + TypeScript + Prisma + Tailwind + shadcn/ui;
   `docker-compose.yml` with `pgvector/pgvector:pg16`; ESLint/Prettier; Vitest;
   `.env.example` documenting every variable; GitHub Actions CI (typecheck, lint,
   test, `prisma migrate diff`).
2. **Live API verification (or fixtures)**: hit `https://www.contrataciones.gov.py/datos/api/v3/doc/`
   — save the swagger/OpenAPI JSON to `docs/reference/dncp-v3-openapi.json`. Verify:
   auth flow, OCDS endpoints (search by date, release/record fetch), pagination,
   response shapes. Record 5–10 real responses as JSON fixtures in
   `src/lib/dncp/__fixtures__/` for tests. **If the API is unreachable from the dev
   environment (see risk T4), document the failure mode in docs/06-risks.md and
   proceed on fixtures built from the OCDS 1.1 schema.**
3. **DNCP client** (`src/lib/dncp/`):
   - `auth.ts`: token manager — exchanges request token for access token, caches,
     proactively refreshes at 13 min, retries on 401 once.
   - `rateLimit.ts`: token bucket, default 3 req/s, hard budget 3,000/15 min.
   - `client.ts`: typed fetch wrapper (backoff on 429/5xx, timeout, JSON validation
     via zod).
   - `ocds.ts`: typed OCDS release/record interfaces (tender, buyer, awards,
     contracts, parties, planning) — only the fields we map, plus passthrough.
4. **Prisma schema** per docs/03 (Tender, Buyer, Award, Supplier, SyncState + FTS
   tsvector generated column and pgvector column via raw migration SQL).
5. **Sync jobs** (`src/worker/`):
   - `syncIncremental`: fetch processes published/modified since watermark → map
     OCDS → upsert by `ocid` → record TenderEvents for status/deadline changes →
     advance watermark. Idempotent, resumable via `SyncState.cursor`.
   - `backfill`: CLI command (`npm run backfill -- --year=2024`) that ingests bulk
     OCDS files (path or URL) — stream-parse, don't load whole file in memory.
   - `worker.ts`: node-cron — incremental every 30 min, nightly reconciliation of
     the last 3 days.
6. **Observability**: structured logs (pino); `SyncState` doubles as health record;
   `/api/health` returns last sync age + counts.

## Acceptance criteria

- `docker compose up` + `npm run worker:dev` ingests real (or fixture) tenders;
  re-running causes zero duplicates.
- `npx prisma studio` shows tenders with title, buyer, amounts, deadline, raw JSON.
- Unit tests: OCDS mapping (fixtures → rows), token refresh, rate limiter.
- Backfill of one month of data completes without hitting API rate limits.
- CI green.
