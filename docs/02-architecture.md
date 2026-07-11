# System Architecture

## Guiding constraints

- **Owner's hosting:** Hostinger. ⚠️ Hostinger **shared/Cloud plans are
  PHP/LiteSpeed-oriented and do not reliably run a persistent Node.js server**;
  Node.js is first-class on **Hostinger VPS** (or their newer app-hosting offerings).
  Decision: build as a standard dockerizable Node.js app; deploy target = Hostinger
  **VPS** (KVM 1/2 is ~$5–10/mo and plenty). If the owner confirms his Cloud plan
  runs Node, same artifact works there. Do not architect anything Hostinger-specific.
- **One process to start with.** No microservices, no Redis, no queues in v1. A
  single Node app + Postgres + a cron loop covers the load easily (Paraguay publishes
  tens–hundreds of tenders/day, not thousands/minute).
- **Boring, proven stack** so any developer/agent can extend it.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 22 LTS**, TypeScript | Owner requirement; TS for agent-friendly refactoring |
| Web framework | **Next.js 15 (App Router)** — full-stack: UI + API routes | One deployable, SSR for SEO (public tender pages are the SEO funnel), great DX |
| DB | **PostgreSQL 16** | JSONB for raw OCDS records, full-text search (Spanish config), `pgvector` for embeddings. Runs in Docker on the VPS. (MySQL on Hostinger shared is the fallback but loses pgvector + Spanish FTS quality — avoid.) |
| ORM | **Prisma** | Schema-as-code, migrations, agent-friendly |
| Ingestion | In-process worker via `node-cron` inside a small standalone `worker.ts` entry (same codebase, second process under systemd/Docker) | Keeps web latency isolated from sync jobs without adding infra |
| AI | **Google Gemini** (default: `gemini-2.5-flash-lite` judge, `gemini-2.5-flash` summaries, `gemini-embedding-001` embeddings) behind a provider abstraction; Anthropic Claude as optional drop-in for premium document analysis | Owner decision: cheapest capable provider, one vendor for LLM+embeddings. See docs/04 |
| Auth | **Auth.js (NextAuth)** — email magic link + Google | Fast to ship |
| Email | **Resend** (or SMTP via Hostinger) | Alerts + magic links |
| Payments | **Stripe** first (works for USD cards); evaluate local rails (Bancard, Tigo Money) post-launch | See docs/06 risks |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, good defaults for data-dense UI |

## Component diagram

```
                    ┌──────────────────────────────────────────────┐
                    │              Hostinger VPS (Docker)          │
                    │                                              │
 DNCP API v3  ────► │  worker.ts (cron)                            │
 (OCDS releases)    │   ├─ token manager (15-min refresh)          │
 Bulk OCDS files ─► │   ├─ rate limiter (≤4 req/s)                 │
                    │   ├─ sync: new/changed tenders → upsert      │
                    │   ├─ enrich: embeddings, AI classification   │
                    │   └─ alerts: match new tenders → email queue │
                    │                    │                          │
                    │                    ▼                          │
                    │   PostgreSQL 16 (+ pgvector)                 │
                    │                    ▲                          │
                    │                    │                          │
 Users ───────────► │  Next.js app (UI + /api/*)                   │
                    │   ├─ public tender pages (SSR, SEO)          │
                    │   ├─ dashboard: feed, filters, saved search  │
                    │   ├─ AI match endpoints → Claude API         │
                    │   └─ Stripe webhooks                          │
                    └──────────────────────────────────────────────┘
```

## Repo layout (target)

```
paraOU/
├─ docs/               # this plan
├─ plan/               # build phases
├─ prisma/             # schema.prisma, migrations, seed
├─ src/
│  ├─ app/             # Next.js App Router (pages + api routes)
│  ├─ components/
│  ├─ lib/
│  │  ├─ dncp/         # DNCP API client: auth, rate-limit, endpoints, OCDS types
│  │  ├─ ai/           # embeddings, match scoring, summaries
│  │  ├─ db.ts
│  │  └─ ...
│  └─ worker/          # worker.ts entry: cron jobs (sync, enrich, alerts)
├─ docker-compose.yml  # app + worker + postgres(pgvector)
├─ .env.example
└─ package.json
```

## Key design decisions

1. **Store raw OCDS JSON + normalized columns.** Every ingested record keeps its full
   OCDS JSON in a JSONB column (never lose data, reprocess anytime), and we project
   the fields we filter/sort on into typed columns (title, buyer, amount, category,
   deadline, status, department...). Schema in docs/03.
2. **`ocid` is the primary business key.** OCDS releases are updates to a process;
   upsert by `ocid`, keep `release_date`/`tag` history minimal (latest compiled state
   + a small history table of status changes for "what changed" alerts).
3. **Idempotent sync with watermarks.** `sync_state` table stores last successful
   window; every job is safe to re-run.
4. **AI costs are controlled at ingestion, not at read time.** Embed each tender
   once at ingest (~$0 at this volume); LLM scoring runs only for (active profile ×
   new tender) pairs that pass the cheap prefilter (docs/04). Never call an LLM in a
   request/response path for lists.
5. **Spanish-first.** DB full-text search uses the `spanish` configuration; UI copy
   lives in an i18n dictionary from day one (es default, en secondary).

## Environments & deployment

- Local dev: `docker compose up` (postgres) + `npm run dev` + `npm run worker:dev`.
- Prod: Docker Compose on the VPS — `web`, `worker`, `db` services + Caddy (or
  Hostinger's panel proxy) for TLS. Nightly `pg_dump` to object storage.
- CI: GitHub Actions — typecheck, lint, tests, prisma migrate diff check.
- Secrets in `.env` on server only; `.env.example` documents every variable.
