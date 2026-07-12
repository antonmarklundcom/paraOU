# Phase 3 — Frontend: overview, filters, detail

**Goal:** the public-facing product per docs/05-ux-ui.md — implement that spec
faithfully; it is the contract. Spanish-first (`es` default), i18n dictionary
structure with `en` stubs.

## Deliverables

1. **`/licitaciones`** — filter rail + result list, all filters URL-serialized,
   chips, sort control, SSR first page + client-side updates (React Server
   Components + `useSearchParams`), skeletons, empty states, stale-data banner.
2. **`/licitaciones/[ocid]`** — detail per spec: countdown hero, key-facts grid,
   process timeline, documents links (out to DNCP), buyer history teaser, .ics
   download, follow/bid/dismiss buttons (stub actions until Phase 4/5 — persist to
   localStorage for anonymous users so the UX is testable now).
3. **Buyer/supplier pages** `/compradores/[id]`, `/proveedores/[id]` — v1: open
   tenders + award history table + simple aggregates.
4. **Landing page `/`** — value prop, live counters ("X licitaciones abiertas hoy,
   Gs. Y en juego"), top categories, CTA to browse + signup teaser.
5. **SEO**: SSR + metadata API — canonical URLs by `ocid`, OpenGraph, JSON-LD,
   sitemap.xml (chunked), robots.txt. Public pages must render fully without JS.
6. **Design system**: shadcn/ui theming per docs/05 visual system; light+dark;
   `Intl.NumberFormat('es-PY')` helpers; timezone America/Asuncion everywhere
   (server renders must not leak UTC dates); responsive — cards on mobile.

## Non-goals in this phase

No auth, no AI badges (render the match-badge component behind a feature flag with
mock data so layout is proven), no payments.

## Acceptance criteria

- Lighthouse ≥ 90 performance/SEO/accessibility on `/licitaciones` and detail page.
- Every docs/05 filter works end-to-end against real ingested data; filter state
  survives reload/share via URL.
- Countdown/deadline rendering correct across timezones (test: server UTC, user
  America/Asuncion).
- Playwright e2e: browse → filter → open detail → download .ics.
- Fully usable at 360 px wide.
