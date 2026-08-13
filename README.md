# ParaOU — Paraguay Public Procurement Intelligence

**"Offentlig upphandling" för Paraguay.** A SaaS platform that ingests every public
tender (licitación / convocatoria) published by Paraguay's DNCP (Dirección Nacional de
Contrataciones Públicas), and gives businesses that sell to the state a beautiful,
filterable overview plus **AI matching**: "show me only the tenders my company can
actually win, ranked, with a plain-language explanation."

## Status

🚧 **Phases 1–6 complete.** Phase 1: DNCP client, Postgres schema, sync worker,
backfill CLI (running on synthetic OCDS fixtures — the build environment couldn't
reach `contrataciones.gov.py`, docs/06 risk T4; live API paths/shapes still need
verification, see [owner checklist](#before-phase-2-owner-must-verify)). Phase 2: the
internal search/filter/sort REST API. Phase 3: the Spanish-first public UI. Phase 4:
company profiles + the 3-stage AI match funnel on Gemini (see
[owner checklist](#before-phase-5--owner-must-verify) — live AI verification is
pending a billing top-up). Phase 5: accounts (Auth.js magic link + optional
Google), saved searches, and the alert digest engine (see
[owner checklist](#before-phase-6--owner-must-verify)). Phase 6: plan gating,
Stripe billing, Business-tier document analysis, `/admin`, and the launch
checklist — see [docs/08-launch.md](docs/08-launch.md) and the
[owner checklist](#launching-owner-must-do) below before going live.

| Phase                                    | Status                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 — Ingestion (client, DB, worker)       | ✅ built & tested (fixtures mode)                                                     |
| 2 — Internal API (search/filter/sort)    | ✅ built & tested                                                                     |
| 3 — Frontend (overview, detail, SEO)     | ✅ built & tested                                                                     |
| 4 — AI matching (profiles, funnel, feed) | ✅ built & tested (recorded AI responses — live calls pending billing, see checklist) |
| 5 — Accounts & alerts                    | ✅ built & tested (dev email transport — live send pending a Resend key)              |
| 6 — Monetization (plans, Stripe, launch) | ✅ built & tested (test-mode Stripe fixtures — no live account connected yet)         |
| F1 — WhatsApp alerts                     | ✅ built & tested (dev transport — no Twilio account/templates yet, see docs/09)      |

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
  `DAILY` at 08:00 America/Asuncion, `WEEKLY` Mondays 08:00. Frequency choice is
  plan-gated as of Phase 6 (`src/lib/plan.ts`) — FREE can only pick `WEEKLY`.
- **`/cuenta`**: locale, alert channel/frequency, WhatsApp opt-in, GDPR-style
  delete (cascades through profiles/matches/saved searches/follows/alert
  logs/WhatsApp messages via the schema's `onDelete: Cascade`).

### WhatsApp alerts (Phase F1)

A second delivery channel behind the same engine — see **`docs/09-whatsapp.md`**
for the full design and the go-live checklist.

- **Provider abstraction** (`src/lib/whatsapp/provider.ts`, mirroring
  `src/lib/ai/provider.ts`): Twilio's WhatsApp Business API over plain `fetch` is
  the default, 360dialog is an explicit not-implemented stub, and a **dev
  transport logs the rendered template** when no credentials are set — the whole
  flow works with no account, exactly like `src/lib/email.ts` without Resend.
- **Templates**: outbound alerts always land outside WhatsApp's 24h window, so
  they are pre-approved Meta templates. The exact Spanish bodies the owner must
  submit live in `src/lib/whatsapp/templates.ts`; their approved ids come from
  `WHATSAPP_TEMPLATE_*_ID`. One tender → deadline warning; several → digest.
- **Delivery state**: `POST /api/whatsapp/webhook` (signature-verified against
  the raw body, like the Stripe webhook) folds `queued→sent→delivered→read` and
  `failed/undelivered` through a pure state machine that is monotonic,
  idempotent and reorder-safe (`src/lib/whatsapp/deliveryState.ts`).
- **Opt-out safety valve**: `WHATSAPP_MAX_DELIVERY_FAILURES` consecutive
  failures (or one permanently-invalid-number error) marks the number `FAILED`;
  replying **BAJA/STOP** marks it `OPTED_OUT`. Either way the channel falls back
  to email instead of going silent, and the engine stops retrying.
- **Gating**: Business+ via `plan.ts` `whatsappAlerts`, enforced on the settings
  write and again at delivery time on the *effective* plan.
- **Dedupe**: `AlertLog` is unique per `(user, tender, channel, reason)`, so each
  channel gets its own exactly-once guarantee.

### Plans & billing (Phase 6)

`src/lib/plan.ts` is the single source of truth for what each tier unlocks —
**data is never gated** (every tender is real-time and free to browse; better
for SEO/trust, and DNCP data is public anyway), only AI depth and alert speed
are paywalled:

|                                       | FREE      | PRO                  | BUSINESS             | AGENCY               |
| ------------------------------------- | --------- | -------------------- | -------------------- | -------------------- |
| Company profiles                      | 1         | 1                    | 3                    | unlimited            |
| Full match reasoning                  | top 3/day | unlimited            | unlimited            | unlimited            |
| Alert frequency                       | weekly    | instant/daily/weekly | instant/daily/weekly | instant/daily/weekly |
| Document analysis ("Analizar pliego") | –         | –                    | ✓ (quota'd/mo)       | ✓                    |
| WhatsApp alerts (F1)                  | –         | –                    | ✓                    | ✓                    |

- **Stripe** (`src/lib/stripe.ts`, `src/lib/api/billing.ts`): Checkout for
  PRO/BUSINESS × monthly/annual, customer portal for cancel/card-change, a
  signature-verified webhook (`checkout.session.completed`,
  `customer.subscription.updated/deleted`) that writes `User.plan` —
  idempotent, and a lapsed/canceled subscription reads as FREE even if the
  stored plan is stale (`effectivePlan()`). `manualBilling` flag on `User`
  supports B2B bank-transfer deals (docs/06 risk B4), bypassing Stripe state.
- **`/precios`**: 4-tier cards, monthly/annual toggle, Checkout kickoff;
  degrades to a `mailto:` CTA when Stripe isn't configured.
- **Gates hit a contextual upgrade prompt, never a dead end**: a blurred match
  reasoning card links to `/precios`; `/cuenta`'s alert-frequency select
  disables options the plan doesn't allow with an upgrade link; a 4th profile
  attempt (FREE/PRO) or an analysis past quota (BUSINESS) returns a clear
  `PLAN_LIMIT`/`QUOTA_EXCEEDED` error the UI surfaces as a prompt, not a crash.
- **Document analysis** (`src/lib/ai/documentAnalysis.ts`, Business tier):
  fetches the tender's PDF, extracts text (`pdf-parse`; scanned/no-OCR PDFs
  degrade to a "not supported yet" result), runs `gemini-2.5-pro` for a
  requirements checklist, caches forever per (tender, document) so re-viewing
  never re-bills the monthly quota (`DOCUMENT_ANALYSIS_MONTHLY_QUOTA`).
- **`/admin`** (`ADMIN_EMAILS` session allowlist): plan distribution, recent
  users, manual plan override (sets `manualBilling`), links to the Phase 4
  `/admin/ai` cost dashboard, ingestion status, alerts-sent count.
- **Launch**: `docker-compose.prod.yml` (Caddy automatic HTTPS + a one-shot
  migration runner) and [docs/08-launch.md](docs/08-launch.md) — the full
  step-by-step for the Hostinger VPS.

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
4. ~~Decide the FREE-plan alert policy~~ — done in Phase 6: FREE is capped to
   `WEEKLY` alerts by `src/lib/plan.ts`, enforced both client-side (disabled
   select) and server-side (`updateAccountPrefs` rejects a disallowed choice).

### Launching (owner must do)

Everything Phase 6 could build without your accounts is built and tested
(Stripe in test-mode fixtures, document analysis against a mocked provider).
Before real users/money touch this:

1. **Stripe**: create the Pro/Business Products + monthly/annual Prices, copy
   the 4 Price ids and your secret/webhook-signing keys into `.env`. Test a
   full subscribe → `/cuenta` shows the new plan → `/admin` shows it too,
   with Stripe **test** keys before switching to live ones.
   [docs/08-launch.md](docs/08-launch.md) step 5 has the exact dashboard steps.
2. **Provision the Hostinger VPS** and run through
   [docs/08-launch.md](docs/08-launch.md) top to bottom — it starts with the
   DNCP-reachability de-risk test (still unverified — see item 4 above), then
   Docker Compose bring-up, Resend, backfill + spot-check, backups (with an
   actual restore test), uptime/error monitoring, analytics, and legal pages.
3. Set `ADMIN_EMAILS` to your real email(s) so `/admin` isn't locked out.
4. **WhatsApp alerts (F1)**: create a Twilio account, get the WhatsApp sender
   (sandbox is fine to start), submit the three Spanish templates from
   `src/lib/whatsapp/templates.ts` for Meta approval, paste their ids +
   SID/token into `.env`, and register
   `https://<domain>/api/whatsapp/webhook` as both the status callback and the
   inbound webhook. Until then the channel logs instead of sending —
   [docs/09-whatsapp.md](docs/09-whatsapp.md) is the full checklist.
5. Everything else from the earlier per-phase checklists above still applies
   (Gemini billing, Resend key, `AUTH_SECRET`, DNCP reachability).

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
| [docs/09-whatsapp.md](docs/09-whatsapp.md)                   | Phase F1 WhatsApp alerts: design, delivery states, and the go-live checklist            |

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
