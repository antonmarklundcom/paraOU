# Risks, Issues & Mitigations

## Technical

| #   | Risk                                                                                                              | Likelihood             | Mitigation                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | **V3 API differs from the V2 docs we planned from** (paths, shapes, OCDS section still "BETA")                    | Medium                 | Phase 1 starts with live exploration against Swagger + saving the spec into the repo. Client code isolates DNCP specifics in `src/lib/dncp/`.                                                        |
| T2  | **15-min access tokens + rate-limit lockout** (hit the cap → blocked until token expires)                         | High if naive          | Central token manager + token-bucket limiter capped well below 5,000/15min; backfill via bulk files, not API.                                                                                        |
| T3  | **API downtime / slowness** (gov infrastructure)                                                                  | Medium                 | Sync is async & idempotent; UI shows "data as of X"; retries with backoff; never user-facing.                                                                                                        |
| T4  | **Geo-blocking**: contrataciones.gov.py returned 403 to our cloud fetcher — they may block foreign/datacenter IPs | Medium                 | Test from the Hostinger VPS early (Phase 1, day 1). If blocked: host the worker on a LatAm VPS region or route via a small proxy in Paraguay/Brazil. This is the biggest unknown — **verify first**. |
| T5  | **Data quality**: missing deadlines, inconsistent categories, encoding                                            | Certain (all gov data) | Store raw JSON, defensive parsing, nullable fields, data-quality dashboard query set.                                                                                                                |
| T6  | **AI cost blowout**                                                                                               | Low with design        | Three-stage funnel, caching, per-day budget kill switch (docs/04).                                                                                                                                   |
| T7  | **Hostinger Cloud plan can't run Node persistently**                                                              | High                   | Plan for Hostinger VPS (~$5–10/mo) with Docker. Confirm before Phase 3 deploy.                                                                                                                       |

## Business / market

| #   | Risk                                                                                                                                                            | Mitigation                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **Existing competitors** (local tender-alert services exist in most countries; check e.g. licitaciones.com.py–style players and Mercado/consultora newsletters) | Differentiate on AI matching + explanations + UX + award-history intelligence. Do a competitor scan before pricing (owner task).                                                             |
| B2  | **Free alternative is the DNCP portal itself** (it has search + its own email alerts)                                                                           | We're not selling the data; we sell _relevance, time saved, and intelligence_. The free tier must be clearly better UX than DNCP to hook users.                                              |
| B3  | **Willingness to pay in PYG market**                                                                                                                            | Price low, anchor on contract value ("one win pays for 10 years"), annual discount, agency tier for consultants who aggregate demand.                                                        |
| B4  | **Payments**: Stripe availability/friction in Paraguay for local businesses                                                                                     | Launch with Stripe (many PY businesses hold USD cards); add Bancard/local rails when revenue justifies; offer manual invoice + bank transfer for annual plans (common B2B practice there).   |
| B5  | **Legal/ToS**: reselling open data                                                                                                                              | Open data is generally free to reuse commercially with attribution — owner verifies portal terms (docs/01) and adds "Fuente: DNCP" everywhere. We deep-link documents rather than rehosting. |
| B6  | **Spanish legal language quality of AI output**                                                                                                                 | Prompt in es-PY, human-review samples weekly at start, feedback button ("¿resumen incorrecto?") on every AI text.                                                                            |
| B7  | **Single-country ceiling**                                                                                                                                      | OCDS-based design makes Chile/Colombia/Uruguay/Ecuador adapters cheap — expansion is the growth story (docs/00).                                                                             |

## Trust & safety

- AI outputs are advisory: always show "Verificá en el pliego oficial" disclaimer;
  never let a summary replace the legal document.
- Don't store DNCP credentials of users (we never ask); our own API creds in server
  env only.
- PII: only user emails/company profiles → simple privacy policy; data stays in the
  VPS; nightly encrypted backups.

## The one thing to de-risk first

**T4 (IP blocking) + T1 (V3 reality check).** Before writing much code: from the
actual production server, authenticate against the real API and pull 100 real
tenders. Everything else in this plan survives contact with reality; these two must
be proven on day one.

## Phase 1 verification log

**2026-07-11 — T4 confirmed in the build environment.** The Phase 1 build ran in a
sandboxed CI environment whose egress proxy **denies `contrataciones.gov.py:443`**
(`CONNECT` → 403). The live Swagger doc, the OAuth token endpoint, and the OCDS data
endpoints were all unreachable, and no DNCP credentials were present. Per PHASE-1
step 2 we therefore proceeded on **fixtures mode**: the ingestion pipeline, mapping,
DB schema, and worker are all built and tested against synthetic OCDS 1.1 record
packages in `src/lib/dncp/__fixtures__/`. The DNCP HTTP client (`src/lib/dncp/`) is
fully implemented but its live endpoint **paths/params and response shapes remain
UNVERIFIED** (see the `⚠️` notes in `client.ts`, `ocds.ts`, `source.ts`).

**Still owned by a human (T1/T4 close-out) — must be done before/at Phase 2:**

1. From the **production VPS (Paraguay/Brazil region)**, confirm the API is reachable
   with real credentials in `.env` (prove T4 is not a blocker there).
2. Save the V3 OpenAPI/Swagger JSON to `docs/reference/dncp-v3-openapi.json`.
3. Replace the synthetic fixtures with 5–10 real record/release responses and adjust
   the zod schemas / endpoint paths / mapping to match reality.
4. Run `npm run sync:once` against the live API and eyeball `prisma studio`.
