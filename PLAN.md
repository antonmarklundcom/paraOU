# PLAN.md — ParaOU: path from "feature-complete" to "launched & earning"

> **Authored by Fable 5** (planning/architecture model) — handoff to **Sonnet 5 / Opus 4.8**
> for implementation. Last full-repo review: 2026-07-16, `main` @ `ecdc30e`
> (Phase 6 monetization merged). Status refreshed 2026-08-13: Phase L1 and
> Phase F items F2/F3/F4 merged; F1 (WhatsApp) is the only Phase F item left.

## Model tiering — who does what

- **Fable 5**: architecture, spec/schema decisions, gap analysis, review gates
  (end-of-phase acceptance review), anything ambiguous or business-critical.
  Do **not** burn Fable time on routine implementation.
- **Sonnet 5**: the default build model for every phase below — all tasks here
  are well-specified mechanical work against an existing, tested codebase.
- **Opus 4.8**: escalate only if a task turns out gnarly — the prime candidates
  are **L2.2** (reconciling the DNCP client against the live V3 API if shapes
  diverge badly from the fixtures) and **F1** (WhatsApp provider integration
  with delivery-state handling).

Start every build session with `plan/KICKOFF-PROMPT.md` and obey `CLAUDE.md`
(especially: DNCP rate discipline, preserve `Tender.raw`, Spanish-first,
AI-cost rules).

## Where the repo actually is (verified against code, 2026-07-16)

**Built, tested, merged (plan/PHASE-1…6 all complete):**

| Area | State |
| --- | --- |
| Ingestion | DNCP client + token/limiter, sync worker (30-min cron + nightly reconcile), JSONL backfill CLI — **runs on synthetic fixtures; live API never reached from any build environment** |
| API | `/api/tenders` search/filter/sort (Spanish FTS + keyset pagination, index-verified), buyers/suppliers, meta/filters, health |
| Frontend | `/`, `/licitaciones` (+detail), buyer/supplier profiles, sitemap/robots, JSON-LD, es-PY money, America/Asuncion dates, dark mode, 360px |
| AI matching | 3-stage funnel (SQL → pgvector+FTS → Gemini judge), provider abstraction, `ai_usage` logging, daily budget kill switch, (profile,tender) cache — **live Gemini calls blocked on billing (429s); costs table is an estimate** |
| Accounts & alerts | Auth.js magic link (+ optional Google), anonymous-profile claim, saved searches, follows, 3-source alert engine with dedupe + INSTANT/DAILY/WEEKLY crons — **email via dev transport; no Resend key** |
| Monetization | `src/lib/plan.ts` gating (FREE/PRO/BUSINESS/AGENCY), Stripe checkout/portal/signature-verified webhook, `manualBilling` override, `/precios`, Business document analysis (pdf-parse + gemini-2.5-pro, cached), `/admin` — **test-mode fixtures only; no live Stripe** |
| Ops | CI (lint/typecheck/vitest/migration gate on pgvector Postgres), 21 test files, Playwright e2e golden paths, `docker-compose.prod.yml` + Caddy, `docs/08-launch.md` |

**The gap to revenue is NOT feature code.** It is (a) verifying every external
integration that was built against fixtures, (b) a small launch-readiness code
list, and (c) VPS operations. Then fast-follows.

## Phase 0 — Owner decisions & external verification (owner + Fable, ~1 session of agent time)

Nothing below this line should start until these gates clear. Items marked 🔑
are **owner decisions** — Fable recommended a default; override in writing (an
issue comment or a note in this file) and the build sessions will follow it.

1. 🔑 **Pricing** — recommended: **Pro $29/mo, Business $99/mo, Agency $299/mo**,
   annual = ×10 ("2 months free"). Rationale: low end of the docs/00 ranges fits
   Paraguay purchasing power (Pro must stay under ~Gs. 400k/mo); raise later once
   there's conversion data. Codify in `plan.ts` + `/precios` in L1.1.
2. 🔑 **Launch scope** — recommended: **launch as-is** (email-only alerts, one
   profile per account). BUT the Business tier currently *advertises* 3 profiles
   and docs/00 promised WhatsApp — see the honesty fix in L1.2. WhatsApp and the
   multi-profile switcher are Phase F fast-follows, not launch blockers.
   *(Update: the multi-profile switcher shipped in F2 — Business/Agency accounts
   can now create/switch/delete profiles. WhatsApp (F1) is still outstanding.)*
3. 🔑 **Agency tier** — recommended: **contact-us / manual** (mailto CTA already
   degrades this way; close deals by hand via `/admin` `manualBilling`). No code.
4. 🔑 **Legal pages** — recommended: **agent-drafted Spanish términos +
   privacidad, owner (ideally lawyer) reviews before live**. Built in L1.3.
5. **DNCP reachability + V3 verification** (docs/06 risk T4 — *the* existential
   technical risk, still unverified): from the production VPS,
   `curl -I https://contrataciones.gov.py/datos/api/oauth/token`; save the live
   Swagger JSON to `docs/reference/dncp-v3-openapi.json`. If blocked → the
   Paraguay/Brazil proxy fallback becomes a Phase L2 task.
6. **Gemini billing top-up** → `npm run ai:smoke` must pass (embed ok, injection
   probe scores <50, sane Spanish summary); verify live pricing against
   `src/lib/ai/pricing.ts`.
7. **Accounts**: Resend key + verified sending domain; Stripe account (test keys
   first); Hostinger VPS + domain; `AUTH_SECRET`; `ADMIN_EMAILS`.
8. Confirm DNCP open-data terms permit commercial reuse (docs/06 risk B5).

## Phase L1 — Launch-readiness code (Sonnet, 1 session)

1. **Finalize pricing in code**: exact price points in `plan.ts` /
   `PricingCards.tsx` (replace the `usdMin/usdMax` ranges), annual toggle copy,
   and document the four `STRIPE_PRICE_*` ids the owner must create.
2. **Tier-honesty pass**: until F2/F1 ship, `/precios` and marketing copy must
   not promise multi-profile or WhatsApp — sell what exists ("3 perfiles —
   próximamente" or drop the line). Cross-check every gate in `plan.ts` against
   what the UI actually delivers.
3. **Legal pages**: `/terminos`, `/privacidad` (Spanish, agent-drafted per the
   Phase 0 decision), footer links, "Fuente: DNCP" attribution check on
   `/precios` + landing.
4. **Launch polish** from docs/08: static OG image (1200×630) wired into layout
   metadata; Plausible/Umami script hook (env-gated); optional Sentry hook in
   `src/lib/log.ts`'s error path.
5. **Acceptance**: CI green; e2e still passes; a fresh reviewer can't find a
   promise on `/precios` the product doesn't keep.

## Phase L2 — Live verification & launch ops (owner-driven, agent-assisted; 1–2 sessions)

Work `docs/08-launch.md` top to bottom. Agent tasks within it:

1. Bring-up support: compose prod stack, Caddy cert, `/api/health` green.
2. **Reconcile DNCP client against the live V3 spec** (paths, shapes,
   pagination) and replace synthetic fixtures with real captured ones; run
   `npm run sync:once` + backfill `--year=2024`; spot-check counts against the
   DNCP portal UI. *(Escalate to Opus if shapes diverge materially.)*
3. Live-wire checks: real magic link + digest land in an inbox (spam check);
   `npm run embed:backfill` + one real profile → sane ranked matches at
   < $0.05/profile/day on `/admin/ai`; Stripe test-mode subscribe →
   `/cuenta` + `/admin` reflect the plan → then live keys.
4. Backups (nightly pg_dump off-box + **tested restore**), uptime monitor on
   `/api/health`, Search Console sitemap submission.
5. **Acceptance = launch**: real data flowing on a 30-min cadence, a real paid
   subscription processed end-to-end, alerts arriving, backups restorable.

## Phase F — Fast-follows (post-launch, priority order; ~3 sessions)

Re-rank against real user feedback before building. Current order:

1. **WhatsApp alerts** (F1, Sonnet→Opus if needed): Twilio/360dialog WhatsApp
   Business API behind a channel abstraction next to `src/lib/email.ts`; digest
   + instant deadline warnings; plan-gated to Business+. The #1
   Paraguay-appropriate feature (docs/07) and a Business-tier promise.
   **Status: not started — the only remaining Phase F item.**
2. ✅ **Multi-profile switcher UI** (F2, Sonnet) — merged (PR #12). Business/
   Agency users can create/name/switch/delete profiles (`ProfileSwitcher`,
   `x-profile-id`); saved searches and follows are now scoped per-profile.
3. ✅ **PAC early-warning** (F3, Sonnet) — merged (PR #11). `PlannedPurchase`
   model + worker sync for DNCP `planificaciones`, surfaced at `/planificacion`
   (Business+ gated). Built/tested against synthetic fixtures — not yet
   verified against the live V3 Swagger (same T4 caveat as tender ingestion).
4. ✅ **"Why did I lose?" award notifications** (F4) — merged (PR #9). A 4th
   alert-engine source fires when a "Voy a ofertar" tender is AWARDED, with
   winner/price/% vs. reference; surfaced on the tender detail page too.

## Phase G — Growth & content/SEO (ongoing, ~1 session to seed)

- The free tender pages ARE the SEO engine (never gate them — `plan.ts` rule).
- Seed: category/department landing pages from existing filter data
  ("Licitaciones de construcción en Alto Paraná"), a free weekly "observatorio"
  stats page (press/link magnet, docs/07 #12), data-freshness badge.
- Measure: Search Console impressions, free→paid conversion, north-star KPI =
  tenders marked "Voy a ofertar" (docs/00).

## Phase X — Graduate (later; Fable review gate before starting)

Competitor/reference-price intelligence (Business justification), bid/no-bid
assistant, team workflows, local payment rails (Bancard/Tigo Money — docs/06
B4), OCR for scanned pliegos, **country expansion via OCDS adapters**
(Uruguay/Chile/Colombia — the long-term prize per docs/00). Each needs a
Fable-authored spec first; none are scheduled.

## What's needed to finish (condensed)

**Code (agent):** price finalization + tier-honesty copy, legal pages, OG/
analytics/Sentry polish, live-DNCP client reconciliation + real fixtures.
**Owner (cannot be automated):** DNCP credentials + VPS reachability test,
Gemini billing, Resend domain, Stripe products/keys/webhook, VPS + domain +
DNS, `AUTH_SECRET`/`ADMIN_EMAILS`, legal review, DNCP-terms confirmation.
**Estimate to launch:** ~3–4 agent sessions (L1: 1, L2: 1–2, contingency for
DNCP divergence: 1) once Phase 0 gates clear. Fast-follows: ~3 more.

## Reusable specs / portfolio notes

This repo predates the portfolio PLAN.md convention and keeps its own
equivalents — **keep using them**: `plan/KICKOFF-PROMPT.md` (session kickoff),
`plan/PHASE-*.md` (specs with acceptance criteria), `docs/` (the why),
`CLAUDE.md` (agent rules). This file is the layer above them. No sibling-repo
specs/skills were visible from this checkout; if the portfolio has a shared
Stripe-integration or SEO-content skill, L1/G could reuse it — flag at session
start. Conversely, this repo's patterns worth exporting to siblings: the
provider-abstracted AI layer with usage logging + budget kill switch
(`src/lib/ai/`), the plan-gating single-source-of-truth (`src/lib/plan.ts`),
and the keyset-paginated FTS search API.

## Open questions for the owner (Phase 0 🔑 items)

Defaults above are Fable's recommendation; the build proceeds on them unless
overridden: (1) exact prices — default $29/$99/$299; (2) launch as-is vs.
build WhatsApp/multi-profile first — default as-is with honest copy;
(3) Agency = contact-us — default yes; (4) legal pages agent-drafted with
owner/lawyer review — default yes. Plus one Fable question: should Phase G
include the English UI toggle early (docs/00 targets foreign bidders; i18n
scaffolding exists) or stay Spanish-only until there's demand?
