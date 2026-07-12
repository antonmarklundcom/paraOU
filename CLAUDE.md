# CLAUDE.md — instructions for coding agents in this repo

## What this project is

ParaOU: a Node.js/TypeScript SaaS that ingests Paraguay's public procurement data
(DNCP API v3 / OCDS), and gives businesses a filterable overview + AI matching of
tenders. Full plan in `docs/`, build phases in `plan/`.

## How to work here

1. **Follow the phases in order** (`plan/PHASE-1` … `PHASE-6`). Don't start a phase
   before the previous phase's acceptance criteria pass. Within a phase, the doc is
   the spec; `docs/` explains the why.
2. **Never commit secrets.** All credentials via `.env` (documented in
   `.env.example`). The DNCP request token, Gemini/Stripe/Resend keys are
   owner-provided; if one is missing, build against fixtures/dev transports and say
   so clearly rather than blocking.
3. **DNCP API discipline** (docs/01): access tokens live 15 min; hard rate limit
   5,000 req/15 min per app — all calls go through the shared client in
   `src/lib/dncp/` (token manager + limiter). Never call DNCP from request handlers;
   ingestion is the worker's job. Historical backfill uses bulk OCDS files, not the
   API.
4. **Preserve raw data.** Every ingested OCDS record keeps its full JSON in
   `Tender.raw`. Normalized columns are projections and may be recomputed.
5. **Spanish-first.** UI copy through the i18n dictionary (es default, en
   secondary); Postgres FTS uses the `spanish` config + `unaccent`; money as
   Decimal, formatted `es-PY`; timezone America/Asuncion.
6. **AI calls** (docs/04): default provider is **Google Gemini** behind the
   abstraction in `src/lib/ai/provider.ts` (owner decision — cost). Check current
   model ids in live provider docs before coding; wrap tender text as untrusted
   data in prompts; log every call to `ai_usage`; respect the daily budget kill
   switch; cache — never re-score unchanged (profile, tender) pairs; never call an
   LLM synchronously to render a list.
7. **Testing**: Vitest units for mapping/limits/gating, integration tests against
   dockerized Postgres, Playwright e2e for the golden paths. CI must stay green.
8. **Stack is fixed** (docs/02): Next.js 15 App Router, Prisma, Postgres 16 +
   pgvector (Docker), node-cron worker, Tailwind + shadcn/ui, Auth.js, Stripe,
   Resend. Don't introduce Redis/queues/microservices without owner sign-off.

## Commands (once scaffolded)

- `docker compose up -d` — Postgres (pgvector)
- `npm run dev` — web; `npm run worker:dev` — sync worker
- `npm run backfill -- --year=YYYY` — bulk historical ingest
- `npx prisma migrate dev` / `npx prisma studio`
- `npm test` / `npm run e2e`

## Known unknowns (check before relying on them)

- V3 endpoint shapes were planned from V2 docs — verify against live Swagger and
  save the spec to `docs/reference/` (Phase 1, step 2).
- contrataciones.gov.py may block datacenter IPs (risk T4 in docs/06) — prove
  reachability from the production VPS early.
- Owner's Hostinger _Cloud_ plan likely can't run persistent Node — target is
  Hostinger VPS with Docker (docs/02).
