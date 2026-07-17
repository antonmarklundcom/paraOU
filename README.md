# ParaOU — Paraguay Public Procurement Intelligence

**"Offentlig upphandling" för Paraguay.** A SaaS platform that ingests every public
tender (licitación / convocatoria) published by Paraguay's DNCP (Dirección Nacional de
Contrataciones Públicas), and gives businesses that sell to the state a beautiful,
filterable overview plus **AI matching**: "show me only the tenders my company can
actually win, ranked, with a plain-language explanation."

## Status

🚧 **Phases 1–5 complete.** Phase 1: DNCP client, Postgres schema, sync worker,
backfill CLI (running on synthetic OCDS fixtures — the build environment couldn't
reach `contrataciones.gov.py`, docs/06 risk T4; live API paths/shapes still need
verification, see [owner checklist](#before-phase-2-owner-must-verify)). Phase 2: the
internal search/filter/sort REST API. Phase 3: the public frontend. Phase 4: AI
company matching (running on a deterministic mock provider — no `GEMINI_API_KEY` in
this environment; see [AI matching](#ai-matching-phase-4) below). Phase 5: accounts,
saved searches, and email alerts (running on a local dev email outbox — no
`RESEND_API_KEY` in this environment; see [Accounts & alerts](#accounts--alerts-phase-5)).

| Phase | Status |
|---|---|
| 1 — Ingestion (client, DB, worker) | ✅ built & tested (fixtures mode) |
| 2 — Internal API (search/filter/sort) | ✅ built & tested |
| 3 — Frontend (overview, detail, SEO) | ✅ built & tested |
| 4 — AI matching | ✅ built & tested (mock provider — no Gemini key) |
| 5 — Accounts & alerts | ✅ built & tested (dev email outbox — no Resend key) |
| 6 — Monetization | ⬜ not started |

### API (Phase 2)

Public, read-only JSON endpoints under `/api` (per-IP rate limited, zod-validated,
envelope `{ ok, data }` / `{ ok, error }`):

| Endpoint | Purpose |
|---|---|
| `GET /api/tenders` | Search/filter/sort feed. Params: `q` (Spanish accent-insensitive FTS), `status[]`, `category[]` (N5 prefix), `buyer`, `department[]`, `method[]`, `amountMin/Max` + `currency` (USD auto-converted), `publishedFrom/To`, `deadlineWithinDays`, `sort` (`newest`\|`deadline`\|`amount`\|`relevance`), keyset `cursor`, `limit`≤50. |
| `GET /api/tenders/[ocid]` | Full detail: awards, buyer, timeline events, buyer-history teaser. |
| `GET /api/buyers?query=` | Accent-insensitive buyer typeahead. |
| `GET /api/buyers/[id]` · `GET /api/suppliers/[id]` | Profile + aggregates (cached 1h). |
| `GET /api/meta/filters` | Filter option lists with counts (cached 1h). |
| `GET /api/health` | Ingestion status + row counts. |

Pagination is keyset (seek) on `(sortValue, ocid)` — stable under concurrent inserts —
backed by expression indexes matching each sort (verified index-backed via
`EXPLAIN ANALYZE`).

### Frontend (Phase 3)

Spanish-first public UI (docs/05), SSR for SEO, light + dark, responsive to 360px:

| Route | What |
|---|---|
| `/` | Landing: value prop, live counters (open tenders / value in play), top categories. |
| `/licitaciones` | Overview: URL-serialized filter rail (works with JS disabled), sort, active-filter chips, SSR first page + client "load more". |
| `/licitaciones/[ocid]` | Detail: countdown hero, key-facts grid, timeline, awards, buyer-history teaser, DNCP document links, `.ics` download, follow (DB when signed in, localStorage otherwise)/bid/dismiss, JSON-LD. |
| `/compradores/[id]` · `/proveedores/[id]` | Buyer/supplier profiles + aggregates. |
| `/sitemap.xml` · `/robots.txt` | SEO. |

Money formatted `es-PY` (compact "Gs. 4,5 mil M"), dates in `America/Asuncion`
(fixed timezone — no UTC leakage). Run `npm run e2e` for the Playwright golden path
(browse → filter → detail → download .ics). The match badge on `/licitaciones` and
the `/panel` feed now show real scores from Phase 4 (see below).

### AI matching (Phase 4)

Implements docs/04 end to end: a three-stage funnel (SQL hard filters → pgvector
semantic recall top-30 → LLM judge) scores every (company profile, open tender)
pair, cached forever until either side changes.

- **No `GEMINI_API_KEY` in this environment** → the app runs on a deterministic
  mock provider (`src/lib/ai/mock.ts`, zero cost, zero network calls) so the whole
  pipeline is testable/demoable offline. Set `GEMINI_API_KEY` in `.env` to switch to
  real Gemini (`gemini-embedding-001` / `gemini-2.5-flash-lite` / `gemini-2.5-flash`
  — model ids are env-overridable, see `.env.example`).
- **`/perfil`** — 3-step company profile wizard (free text → AI-suggested
  categories → amount/certifications), ends with instant sample matches. No
  Auth.js yet (Phase 5): profiles are keyed by a random `httpOnly` cookie
  (`src/lib/anon.ts`), not an account — the *row* still lives in Postgres from the
  start because the worker's batch pipeline needs something durable to score
  against.
- **`/panel`** — feed grouped Nuevos / Cierran pronto / Guardados, save/bid/dismiss
  wired to `Match.userAction`.
- **Cost controls**: every AI call is logged to `ai_usage`; `AI_DAILY_BUDGET_USD`
  pauses Stage 3 (judge/summarize/suggest-categories) once today's spend is met —
  embeddings are excluded (near-free, needed for basic recall). `GET /api/admin/ai`
  (gated by `ADMIN_TOKEN` header `x-admin-token`) shows spend + recent match
  samples.
- Tender text is always wrapped as `<tender_data>` and explicitly described as
  untrusted third-party data in the system instruction — prompt-injection hygiene
  for a field sourced from government-published, third-party-authored text.
- `npm run ai:enrich` — one-shot embed + summarize + match run (also runs
  automatically after every worker sync).

### Accounts & alerts (Phase 5)

Implements docs/05 §Alert emails end to end: Auth.js v5 (`next-auth@5.0.0-beta.31`
+ `@auth/prisma-adapter`) for magic-link (primary) + optional Google sign-in, saved
searches, and a daily digest email.

- **No `RESEND_API_KEY` in this environment** → outbound email (magic links +
  digests) is written to a local JSONL file (`src/lib/email/transport.ts`) instead
  of sent. Set `RESEND_API_KEY` to switch to real Resend. Request shapes were taken
  from Auth.js's own built-in Resend provider source, verified live 2026-07-16.
- **Anonymous → account migration**: Phase 4's `httpOnly` anon cookie identifies a
  pre-signup profile; `src/lib/identity.ts` links it to the real account the first
  time an authenticated request touches it. Verified live end to end (create profile
  anonymously → sign in with a new email → profile appears under the account).
- **Saved searches**: "Guardar búsqueda" on `/licitaciones` (gated behind sign-in);
  manage (rename via re-save, toggle alerting, delete) from `/panel`.
- **Alert engine** (`src/worker/alerts.ts`, runs after every sync + nightly
  reconcile): gathers new high-score `Match`es (≥70), saved-search hits, and
  status/deadline changes on followed tenders; dedupes via `AlertLog` (a tender is
  **never** alerted twice); caps each digest at 10 items, rolling any overflow into
  the next run. `alertFrequency` (INSTANT/DAILY/WEEKLY/NONE) is enforced per user —
  plan-based gating (FREE/PRO/etc.) is deferred to Phase 6 since billing doesn't
  exist yet.
- **Account page `/cuenta`**: locale, alert channel/frequency, one-click
  `DELETE /api/account` (full cascade — verified live: user, profiles, matches,
  saved searches, follows, and alert log all removed; other users' data untouched).
  One-click `List-Unsubscribe` header (RFC 8058) on every digest.
- `npm run alerts:once` — one-shot alert engine run for local verification.
- Playwright e2e (`e2e/auth.spec.ts`) drives the real golden path — signup → click
  the magic link (read from the dev outbox) → create a profile → save a search →
  trigger the alert engine → assert exactly one digest, then zero on re-run — via
  two dev-only routes (`/api/dev/last-email`, `/api/dev/run-alerts`) gated by
  `DEV_EMAIL_OUTBOX_ENABLED=1`, which is **never** set outside local dev/e2e.

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
