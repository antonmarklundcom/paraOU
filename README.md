# ParaOU — Paraguay Public Procurement Intelligence

**"Offentlig upphandling" för Paraguay.** A SaaS platform that ingests every public
tender (licitación / convocatoria) published by Paraguay's DNCP (Dirección Nacional de
Contrataciones Públicas), and gives businesses that sell to the state a beautiful,
filterable overview plus **AI matching**: "show me only the tenders my company can
actually win, ranked, with a plain-language explanation."

## Status

🚧 **Phase 1 (ingestion) complete — running on fixtures.** The DNCP client, Postgres
schema, sync worker, and backfill CLI are built and tested. Because the build
environment could not reach `contrataciones.gov.py` (network policy — docs/06 risk
T4) and no DNCP credentials were available, ingestion currently runs against
synthetic OCDS fixtures. The live API paths/shapes still need verification — see
[owner checklist](#before-phase-2-owner-must-verify) below. Phases 2–6 not started.

| Phase | Status |
|---|---|
| 1 — Ingestion (client, DB, worker) | ✅ built & tested (fixtures mode) |
| 2 — Internal API | ⬜ not started |
| 3 — Frontend | ⬜ not started |
| 4 — AI matching | ⬜ not started |
| 5 — Accounts & alerts | ⬜ not started |
| 6 — Monetization | ⬜ not started |

### Running locally (Phase 1)

```bash
cp .env.example .env        # fill DNCP_* to use the live API; leave blank for fixtures
docker compose up -d        # Postgres 16 + pgvector
npm install
npx prisma migrate deploy   # create schema (FTS + pgvector columns)
npm run worker:dev          # cron worker: sync now + every 30 min (+ nightly reconcile)
# one-off helpers:
npm run sync:once                       # single incremental sync
npm run backfill -- --year=2024 --file=records.jsonl   # bulk historical load (JSONL)
npx prisma studio                       # browse ingested tenders
curl localhost:3000/api/health          # ingestion health (run `npm run dev` first)
```

Without `DNCP_*` secrets the worker/backfill ingest the fixtures in
`src/lib/dncp/__fixtures__/` so the pipeline is runnable end-to-end offline.

### Before Phase 2 — owner must verify

1. From the **production VPS**, confirm the DNCP API is reachable with your real
   credentials in `.env` (proves docs/06 risk T4 is not a blocker there).
2. Save the V3 OpenAPI/Swagger JSON to `docs/reference/dncp-v3-openapi.json`, then
   reconcile `src/lib/dncp/ocds.ts` + `client.ts` + `source.ts` (shapes, endpoint
   paths, pagination) against it and replace the synthetic fixtures with real ones.
3. Run `npm run sync:once` against the live API and eyeball `npx prisma studio`.

CI note: the migration gate uses `prisma migrate deploy` + `prisma migrate status`
rather than a strict `prisma migrate diff --exit-code`, because Prisma cannot model
the hand-written pgvector / generated-`tsvector` SQL and would report false drift.

## Read this first (order matters)

| Doc | What it covers |
|---|---|
| [docs/00-vision.md](docs/00-vision.md) | Product vision, target users, business model, revenue ideas |
| [docs/01-dncp-api.md](docs/01-dncp-api.md) | The DNCP API v3: auth, endpoints, rate limits, what's free, what you must register for |
| [docs/02-architecture.md](docs/02-architecture.md) | System architecture (Node.js), hosting on Hostinger, deployment |
| [docs/03-data-model.md](docs/03-data-model.md) | Database schema |
| [docs/04-ai-matching.md](docs/04-ai-matching.md) | How AI matching works (filters → embeddings → LLM scoring) |
| [docs/05-ux-ui.md](docs/05-ux-ui.md) | UX/UI specification for the tender overview and detail pages |
| [docs/06-risks.md](docs/06-risks.md) | Known issues, risks, and mitigations |
| [docs/07-improvement-ideas.md](docs/07-improvement-ideas.md) | Post-launch roadmap and feature ideas |

## Build phases (for the coding agent)

Execute in order. Each phase doc is self-contained with acceptance criteria.
Start each build session with the prompt in [plan/KICKOFF-PROMPT.md](plan/KICKOFF-PROMPT.md).

1. [plan/PHASE-1-ingestion.md](plan/PHASE-1-ingestion.md) — DNCP client + database + sync worker
2. [plan/PHASE-2-api.md](plan/PHASE-2-api.md) — Internal REST API: search, filter, sort
3. [plan/PHASE-3-frontend.md](plan/PHASE-3-frontend.md) — Web app: overview, filters, detail page
4. [plan/PHASE-4-ai-matching.md](plan/PHASE-4-ai-matching.md) — Company profiles + AI match scoring
5. [plan/PHASE-5-accounts-alerts.md](plan/PHASE-5-accounts-alerts.md) — Auth, saved searches, email alerts
6. [plan/PHASE-6-monetization.md](plan/PHASE-6-monetization.md) — Plans, billing, launch checklist

## What the owner must do manually (cannot be automated)

See [docs/01-dncp-api.md](docs/01-dncp-api.md#what-you-must-do-yourself) — register on the
DNCP portal for API credentials, get an Anthropic API key, verify Hostinger Node.js
support, and pick a domain.
