# Phase 6 — Plans, billing, launch

**Goal:** money in, product out. Implements the tier ladder from docs/00-vision.md.
**Prereqs:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs created in the
Stripe dashboard by the owner (monthly + annual for PRO and BUSINESS).

## Deliverables

1. **Plan gating middleware** (`src/lib/plan.ts` — single source of truth):
   - FREE: browse all, filters, 1 profile, matches visible but reasoning blurred
     beyond top 3/day, no alerts (or weekly teaser). Data delayed? **No — keep data
     real-time for everyone; gate intelligence, not the public record** (better for
     SEO/trust, and DNCP data is public anyway).
   - PRO: full matching + reasoning, saved searches + daily alerts, 1 profile.
   - BUSINESS: 3 profiles, instant alerts, buyer/award history full, competitor
     watchlists, AI document analysis (see 4), multi-seat (owner + 2).
2. **Stripe**: Checkout for subscribe/upgrade, customer portal for
   cancel/card-change, webhooks (`checkout.session.completed`,
   `customer.subscription.updated/deleted`) → `User.plan`. Handle grace on payment
   failure (7 days). Annual = 2 months free. Manual-invoice flag an admin can set
   on a user (B2B bank-transfer deals — see risk B4).
3. **Pricing page `/precios`** — tier table, PYG-equivalent hints, FAQ, "one won
   contract pays for years" anchor, testimonials placeholder.
4. **Business-tier: AI document analysis** ("Analizar pliego"): fetch tender PDFs
   from DNCP links, extract text (pdf-parse; OCR out of scope v1 — show "scanned
   document not supported yet"), `claude-sonnet-5` requirements checklist per
   docs/04; cache per document; count against a per-month quota (e.g. 30 analyses).
5. **Admin `/admin`** (env-allowlisted emails): users/plans, sync health, AI spend,
   manual plan override, alert stats.
6. **Launch checklist** (execute what's automatable, document the rest in
   `docs/07-launch.md`):
   - Deploy to Hostinger VPS: Docker Compose (web, worker, db, Caddy TLS), backups
     (nightly `pg_dump` + offsite), uptime monitor, error tracking (Sentry).
   - **Run the day-one de-risk test from docs/06 on the production VPS** (API
     reachability from that IP) if not already proven.
   - Analytics (Plausible/Umami — cookieless), sitemap submitted, OG images.
   - Legal pages: términos, privacidad, "Fuente: DNCP" attribution site-wide.
   - Backfill full history, verify counts against DNCP portal spot checks.

## Acceptance criteria
- Stripe test-mode: subscribe → plan flips → gated features unlock; cancel →
  downgrade at period end; webhook signature verified; all covered by tests using
  Stripe CLI fixtures.
- FREE user hitting a gate sees a contextual upgrade prompt (not a dead end).
- Document analysis returns a checklist for a real pliego PDF and decrements quota.
- `docker compose -f docker-compose.prod.yml up` on a clean VPS brings up the full
  stack with TLS.
