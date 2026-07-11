# UX / UI Specification

Design principle: **a Bloomberg-terminal-calm feed for tenders** — data-dense but
scannable, zero clutter, deadline-driven. Spanish-first. Mobile matters (many SME
owners live on their phones/WhatsApp).

## Pages

### 1. `/licitaciones` — the overview (public, SEO-indexed)
The heart of the product. Layout: **filter rail (left, collapsible) + result list
(center) + optional detail peek (right on wide screens)**.

Each tender row (card on mobile):
```
┌────────────────────────────────────────────────────────────────┐
│ ● ABIERTA   Adquisición de insumos médicos para hospitales      │
│ Ministerio de Salud Pública · Asunción · Licitación Pública     │
│ Gs. 2.400 mill. (~USD 320k)      ⏰ Cierra en 9 días (24 jul)   │
│ [Salud/Insumos]                       92% match ▸ ver por qué   │
└────────────────────────────────────────────────────────────────┘
```
- Status dot color-coded (green open, amber closing ≤7d, gray closed/awarded).
- **Deadline countdown is the most prominent secondary element** — this is what
  users fear missing.
- Match badge only when logged in with a profile; clicking expands the AI reasoning
  inline (no page jump).
- Row click → detail page; middle-click friendly (real links, SSR).

Filters (all URL-serialized → shareable/savable):
- Text search (FTS, accent-insensitive), Status, Category (N5 tree with search),
  Buyer (typeahead), Department (map or list), Amount range (dual slider, PYG/USD
  toggle), Procurement method, Published date, Deadline window ("closes in ≤ 7
  days"), "Only my matches" toggle.
- Sort: relevance | newest | deadline soonest | amount desc. Default for logged-in
  users with profile: **match score**; anonymous: newest.
- Active filters shown as removable chips; "Save this search + alert me" button top
  right — this is the conversion moment, gate it behind signup.

Empty/edge states: skeleton loaders, "no results — widen X" suggestions, and a
banner if data sync is stale (>2h since last successful sync).

### 2. `/licitaciones/[ocid]` — tender detail (public, SEO)
- Header: title, status, buyer (link to buyer page), countdown hero.
- **AI summary box** at top ("Resumen en simple") with match panel if profiled.
- Key facts grid: amounts, method, category, dates (published, Q&A deadline, bid
  deadline, opening), guarantees if present.
- Timeline visual of the process stages (planning → tender → award → contract).
- Documents: links out to DNCP pliegos (we deep-link, don't rehost in v1).
- "Historial del comprador": last awards by this buyer in this category, who won,
  amounts (Business-tier beyond 3 rows).
- Actions: 🔔 follow (alerts on changes), 📅 add deadline to calendar (.ics),
  ✅ "Voy a ofertar" (bidding), ✖️ "No es para mí" (feeds matching).
- Canonical link to the official DNCP page, "Fuente: DNCP" attribution.

### 3. `/panel` — logged-in dashboard
- "Tu feed": matched tenders ranked, grouped **Nuevos / Cierran pronto / Guardados**.
- Profile completeness nudge (better profile → better matches).
- Saved searches with per-search alert toggles.
- Business tier: competitor watchlist + buyer analytics widgets.

### 4. `/perfil` — company profile wizard
3 steps, < 3 minutes: (1) describe your company in your own words (big textarea —
this drives embeddings), (2) pick categories (searchable N5 tree, suggest from the
description via AI), (3) scope: departments, amount range, exclude words. Show 5
sample matches immediately at the end — the aha moment.

### 5. Buyer & supplier pages (SEO + intelligence)
`/compradores/[id]`: agency's open tenders, historical spend by category, average
process duration. `/proveedores/[id]`: contracts won, categories, buyers. These
pages compound SEO.

## Visual system
- Tailwind + shadcn/ui. Typography-led, generous whitespace, one accent color
  (suggest deep red/blue nodding to the Paraguayan flag without being kitsch).
- Light + dark mode. WCAG AA contrast. Status conveyed by icon+text, not color only.
- Numbers: `Intl.NumberFormat('es-PY')`; compact currency ("Gs. 2.400 mill.").
- Dates: absolute + relative ("24 jul · en 9 días"), timezone America/Asuncion.

## Alert emails
One daily digest per profile (configurable to instant): max 10 items, same card
anatomy as the feed, deep links with auth token, big deadline text. Subject line:
"3 licitaciones nuevas para [Company] — la primera cierra el 24/07".
