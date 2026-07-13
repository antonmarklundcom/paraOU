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
internal search/filter/sort REST API. Phase 3: the Spanish-first public UI. Phase 4:
company profiles + the 3-stage AI match funnel on Gemini (see
[owner checklist](#before-phase-5--owner-must-verify) — live AI verification is
pending a billing top-up). Phase 5: accounts (Auth.js magic link + optional
Google), saved searches, and the alert digest engine (see
[owner checklist](#before-phase-6--owner-must-verify)).

| Phase                                    | Status                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 — Ingestion (client, DB, worker)       | ✅ built & tested (fixtures mode)                                                     |
| 2 — Internal API (search/filter/sort)    | ✅ built & tested                                                                     |
| 3 — Frontend (overview, detail, SEO)     | ✅ built & tested                                                                     |
| 4 — AI matching (profiles, funnel, feed) | ✅ built & tested (recorded AI responses — live calls pending billing, see checklist) |
| 5 — Accounts & alerts                    | ✅ built & tested (dev email transport — live send pending a Resend key)              |
| 6 — Monetization                         | ⬜ not started                                                                        |

### API (Phase 2)

Public, read-only JSON endpoints under `/api` (per-IP rate limited, zod-validated,
envelope `{ ok, data }` / `{ ok, error }`):

| Endpoint                                           | Purpose                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/tenders`                                 | Search/filter/sort feed. Params: `q` (Spanish accent-insensitive FTS), `status[]`, `category[]` (N5 prefix), `buyer`, `department[]`, `method[]`, `amountMin/Max` + `currency` (USD auto-converted), `publishedFrom/To`, `deadlineWithinDays`, `sort` (`newest`\|`deadline`\|`amount`\|`relevance`), keyset `cursor`, `limit`≤50. |
| `GET /api/tenders/[ocid]`                          | Full detail: awards, buyer, timeline events, buyer-history teaser.                                                                                                                                                                                                                                                                |
| `GET /api/buyers?query=`                           | Accent-insensitive buyer typeahead.                                                                                                                                                                                                                                                                                               |
| `GET /api/buyers/[id]` · `GET /api/suppliers/[id]` | Profile + aggregates (cached 1h).                                                                                                                                                                                                                                                                                                 |
| `GET /api/meta/filters`                            | Filter option lists with counts (cached 1h).                                                                                                                                                                                                                                                                                      |
| `GET /api/health`                                  | Ingestion status + row counts.                                                                                                                                                                                                                                                                                                    |

Pagination is keyset (seek) on `(sortValue, ocid)` — stable under concurrent inserts —
backed by expression indexes matching each sort (verified index-backed via
`EXPLAIN ANALYZE`).

### Frontend (Phase 3)

Spanish-first public UI (docs/05), SSR for SEO, light + dark, responsive to 360px:

| Route                                     | What                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                       | Landing: value prop, live counters (open tenders / value in play), top categories.                                                                                              |
| `/licitaciones`                           | Overview: URL-serialized filter rail (works with JS disabled), sort, active-filter chips, SSR first page + client "load more".                                                  |
| `/licitaciones/[ocid]`                    | Detail: countdown hero, key-facts grid, timeline, awards, buyer-history teaser, DNCP document links, `.ics` download, follow/bid/dismiss (localStorage until Phase 5), JSON-LD. |
| `/compradores/[id]` · `/proveedores/[id]` | Buyer/supplier profiles + aggregates.                                                                                                                                           |
| `/sitemap.xml` · `/robots.txt`            | SEO.                                                                                                                                                                            |

Money formatted `es-PY` (compact "Gs. 4,5 mil M"), dates in `America/Asuncion`
(fixed timezone — no UTC leakage). Run `npm run e2e` for the Playwright golden paths
(browse → filter → detail → .ics; profile wizard → panel; sign-in → saved search →
digest).

### AI matching (Phase 4)

Per docs/04: a 3-stage funnel so LLM cost scales with matches, not tenders.

- **Provider abstraction** `src/lib/ai/provider.ts` — Gemini default
  (`AI_PROVIDER=gemini`), Anthropic stub; model ids env-overridable
  (`GEMINI_MODEL_*`). Every call logged to `ai_usage`; daily budget
  (`AI_DAILY_BUDGET_USD`) trips a kill switch that pauses judging + summaries.
- **Funnel** (worker job after each sync): SQL hard filters → pgvector cosine
  top-30 blended with FTS keyword hits → `gemini-2.5-flash-lite` judge with a JSON
  schema; tender text is wrapped as untrusted data (prompt-injection hygiene).
  Judged pairs are cached per (profileVersion, tenderVersion) — unchanged pairs are
  never re-sent to the LLM.
- **Routes**: `/perfil` (3-step wizard, anonymous localStorage token until Phase 5,
  instant 5 sample matches), `/panel` (feed grouped Nuevos / Cierran pronto /
  Guardados with save/bid/dismiss → `Match.userAction`), AI summary card on tender
  detail, `/admin/ai?key=$ADMIN_KEY` (spend, kill-switch state, quality samples).
- **CLIs**: `npm run embed:backfill` (OPEN tenders first), `npm run ai:smoke`
  (live provider check incl. a prompt-injection probe).

### Accounts & alerts (Phase 5)

Per docs/03/05: Auth.js v5 with database sessions.

- **Auth**: `/login` — email magic link is primary (`next-auth/providers/resend`,
  routed through `src/lib/email.ts` so dev mode logs the link instead of requiring
  a Resend key); Google OAuth registers only when `GOOGLE_CLIENT_ID`/`_SECRET` are
  set. First sign-in claims the browser's anonymous `/perfil` profile
  (`POST /api/profile/claim`, fired once by `ClaimProfileOnLogin`) — never
  overwrites a profile the account already owns.
- **Saved searches**: "Guardar búsqueda" on `/licitaciones` serializes the current
  filter query string to `SavedSearch`; managed (run/rename/toggle-alert/delete)
  from `/panel`.
- **Follow**: 🔔 on tender detail persists to `FollowedTender` for signed-in users
  (still localStorage for anonymous visitors); status/deadline `TenderEvent`s after
  the follow drive "tender changed" alerts.
- **Alert engine** (`src/lib/alerts/`, run by the worker): unions three sources —
  saved-search hits, `Match.score ≥ ALERT_MIN_MATCH_SCORE`, and followed-tender
  changes — dedupes against `AlertLog` (a (user, tender, channel) triple is only
  ever emailed once), and sends a React Email digest (max
  `ALERT_DIGEST_MAX_ITEMS`, deadline-first, `List-Unsubscribe` header). Frequency
  tiers run on separate cron schedules: `INSTANT` on every 30-min sync tick,
  `DAILY` at 08:00 America/Asuncion, `WEEKLY` Mondays 08:00. Plan-based gating
  (docs/04: "FREE: none or weekly teaser") is a Phase 6 hook — every plan
  currently gets its chosen frequency, since billing doesn't exist yet.
- **`/cuenta`**: locale, alert channel/frequency, GDPR-style delete (cascades
  through profiles/matches/saved searches/follows/alert logs via the schema's
  `onDelete: Cascade`).

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

### Before Phase 5 — owner must verify

1. **Top up Gemini billing.** The build environment reached the live API but every
   generate/embed call returned 429 `RESOURCE_EXHAUSTED` ("prepayment credits
   depleted") — manage billing at https://ai.studio/projects, then run
   `npm run ai:smoke` and confirm: embed ok, the irrelevant medical tender scores
   < 50 despite the embedded injection attempt, and a sane Spanish summary.
2. With credits in place: `npm run embed:backfill`, create a profile at `/perfil`,
   and eyeball ranked matches + costs on `/admin/ai?key=$ADMIN_KEY`
   (set `ADMIN_KEY` in `.env`). One profile × one day should cost < $0.05.
3. Verify current Gemini **pricing** against `src/lib/ai/pricing.ts` (the sandbox
   proxy blocked ai.google.dev, so the cost table is a mid-2026 estimate).
4. Still open from Phase 1: DNCP reachability from the production VPS (item list
   above) — matching runs on synthetic fixtures until real tenders flow.

### Before Phase 6 — owner must verify

1. **Get a Resend API key** (or SMTP creds) and set `RESEND_API_KEY` +
   `RESEND_FROM_EMAIL` — until then all mail (magic links, digests) logs to the
   console instead of sending. Verify a real magic-link sign-in and a real digest
   land in an inbox, and check the digest renders acceptably in Gmail/Outlook
   (React Email preview: `npx email dev` against `src/lib/alerts/DigestEmail.tsx`).
2. **Set `AUTH_SECRET`** in production (`openssl rand -base64 32`) — required by
   Auth.js; the app falls back to an insecure dev default without it.
3. Optional: register a Google OAuth app and set `GOOGLE_CLIENT_ID`/`_SECRET` if
   you want the Google sign-in button (magic link works without it).
4. Decide the FREE-plan alert policy (docs/04 says "none or weekly teaser") once
   Phase 6 billing exists — `sendDigestForUser` currently honors every user's
   chosen `alertFrequency` regardless of plan.

CI note: the migration gate uses `prisma migrate deploy` + `prisma migrate status`
rather than a strict `prisma migrate diff --exit-code`, because Prisma cannot model
the hand-written pgvector / generated-`tsvector` SQL and would report false drift.

## Read this first (order matters)

| Doc                                                          | What it covers                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [docs/00-vision.md](docs/00-vision.md)                       | Product vision, target users, business model, revenue ideas                            |
| [docs/01-dncp-api.md](docs/01-dncp-api.md)                   | The DNCP API v3: auth, endpoints, rate limits, what's free, what you must register for |
| [docs/02-architecture.md](docs/02-architecture.md)           | System architecture (Node.js), hosting on Hostinger, deployment                        |
| [docs/03-data-model.md](docs/03-data-model.md)               | Database schema                                                                        |
| [docs/04-ai-matching.md](docs/04-ai-matching.md)             | How AI matching works (filters → embeddings → LLM scoring)                             |
| [docs/05-ux-ui.md](docs/05-ux-ui.md)                         | UX/UI specification for the tender overview and detail pages                           |
| [docs/06-risks.md](docs/06-risks.md)                         | Known issues, risks, and mitigations                                                   |
| [docs/07-improvement-ideas.md](docs/07-improvement-ideas.md) | Post-launch roadmap and feature ideas                                                  |
| [docs/08-launch.md](docs/08-launch.md)                       | Phase 6 launch checklist: VPS setup, Stripe, backups, monitoring, legal                |

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
